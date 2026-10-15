-- ============================================
-- Que nadie pueda trabar el calendario de un complejo
-- ============================================
-- La auditoría del 15/10 probó esto, no lo supuso: con la clave publicable
-- —la que está en el JavaScript de la página, a la vista de cualquiera— nueve
-- llamadas a `crear_reserva` desde la línea de comandos tomaron catorce noches
-- en menos de un segundo, sin abrir la página.
--
-- No había NINGÚN freno: ni por mail, ni por complejo, ni de ritmo. Las
-- validaciones que sí existían —mínimo de noches, día de entrada, precio
-- cargado, bloque fijo— limitan DÓNDE se puede trabar, no CUÁNTO.
--
-- Un script de diez líneas dejaba todas las unidades de todos los complejos
-- tomadas durante las horas del plazo de la seña, y se volvía a correr apenas
-- vencían. El dueño veía su calendario lleno y no podía vender.
--
-- ------------------------------------------------------------------
-- Por qué el freno va en la BASE y no en el servidor
-- ------------------------------------------------------------------
-- Porque `crear_reserva` está concedida a `anon` y se puede llamar derecho por
-- `/rest/v1/rpc/crear_reserva`, sin pasar por nuestro servidor. Un límite en la
-- acción de servidor protegería el camino que ya era el bueno y dejaría abierto
-- el que se usa para atacar. La base es el único lugar por el que pasan los dos.
--
-- ------------------------------------------------------------------
-- Los tres límites, y por qué cada uno
-- ------------------------------------------------------------------
--   1. **Tres señas vigentes por mail y complejo.** Una familia que reserva dos
--      cabañas y se equivoca una vez entra; un script con un mail no.
--   2. **Dos señas vigentes por unidad activa, con piso de seis.** Un complejo
--      de cuatro cabañas tolera ocho esperando transferencia a la vez, que ya
--      es un día extraordinario. Esto frena al script que rota mails.
--   3. **Tres reservas por minuto en el mismo complejo.** Un complejo de 3 a 15
--      unidades no recibe cuatro reservas en sesenta segundos ni en el mejor
--      fin de semana de su vida; un script hace siete en un segundo. Este es el
--      que corta la ráfaga.
--
-- Los tres cuentan SÓLO las de origen 'web' y en estado HOLD_TRANSFER: lo que
-- el dueño cargue a mano, y lo que ya esté confirmado, no cuenta para nada.
--
-- Y los tres devuelven `ok: false` con un mensaje, no una excepción: para el
-- huésped de verdad que se topa con el límite esto tiene que leerse como «probá
-- en un rato», no como un error del sistema.

-- ------------------------------------------------------------------
-- Los números, en un solo lugar
-- ------------------------------------------------------------------
-- Acá y no esparcidos adentro de la función, para que cambiarlos sea cambiar
-- una línea y para que la prueba pueda afirmar sobre ellos.
CREATE OR REPLACE FUNCTION public.limites_de_reserva()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'por_mail', 3,
    'por_unidad_activa', 2,
    'piso_por_complejo', 6,
    'por_minuto', 3
  );
$$;

REVOKE ALL ON FUNCTION public.limites_de_reserva() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limites_de_reserva() TO authenticated, service_role;

-- ------------------------------------------------------------------
-- `crear_reserva`, con los frenos adentro
-- ------------------------------------------------------------------
-- Cambia además lo que devuelve al salir bien: ahora trae `datos_transferencia`
-- y `whatsapp`. Eso no es comodidad, es la otra mitad del arreglo —ver abajo,
-- en `datos_para_transferir`—: la página dejaba esos datos al alcance de
-- cualquiera que supiera el slug, y ahora los recibe sólo quien acaba de
-- reservar.
CREATE OR REPLACE FUNCTION public.crear_reserva(
  p_slug      TEXT,
  p_unidad    UUID,
  p_check_in  DATE,
  p_check_out DATE,
  p_personas  SMALLINT,
  p_nombre    TEXT,
  p_dni       TEXT,
  p_email     TEXT,
  p_telefono  TEXT,
  p_acompanantes JSONB DEFAULT '[]'::jsonb,
  p_medio_pago   TEXT DEFAULT 'transferencia',
  p_notas        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complejo  complejos%ROWTYPE;
  v_unidad    unidades%ROWTYPE;
  v_cfg       config_calendario%ROWTYPE;
  v_minimo    SMALLINT;
  v_dias      SMALLINT[];
  v_bloque    bloques_fijos%ROWTYPE;
  v_noches    INTEGER;
  v_cotiz     JSONB;
  v_hoy       DATE;
  v_desde     DATE;
  v_id        UUID;
  v_lim       JSONB := public.limites_de_reserva();
  v_vigentes  INT;
  v_tope      INT;
BEGIN
  SELECT * INTO v_complejo FROM complejos WHERE slug = lower(p_slug);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'complejo_inexistente');
  END IF;

  IF NOT v_complejo.reservas_habilitadas THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'reservas_cerradas',
      'mensaje', 'Por el momento no estamos tomando reservas por la página.');
  END IF;

  SELECT * INTO v_unidad FROM unidades
   WHERE id = p_unidad AND complejo_id = v_complejo.id AND activa;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'unidad_inexistente');
  END IF;

  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_in >= p_check_out THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fechas_invalidas',
      'mensaje', 'La fecha de salida tiene que ser posterior a la de entrada.');
  END IF;

  v_hoy := (now() AT TIME ZONE v_complejo.zona_horaria)::date;

  SELECT * INTO v_cfg FROM config_calendario WHERE complejo_id = v_complejo.id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'calendario_sin_configurar');
  END IF;

  v_desde := greatest(coalesce(v_cfg.primera_fecha, v_hoy), v_hoy);
  IF p_check_in < v_desde THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'antes_de_la_ventana',
      'mensaje', format('Se puede reservar desde el %s.', to_char(v_desde, 'DD/MM/YYYY')));
  END IF;

  IF p_check_out > v_cfg.ultima_fecha + 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'despues_de_la_ventana',
      'mensaje', format('Por el momento sólo se puede reservar hasta el %s.',
                        to_char(v_cfg.ultima_fecha, 'DD/MM/YYYY')));
  END IF;

  v_noches := p_check_out - p_check_in;

  SELECT * INTO v_bloque FROM bloques_fijos
   WHERE complejo_id = v_complejo.id
     AND daterange(check_in, check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
   LIMIT 1;

  IF FOUND AND NOT (p_check_in = v_bloque.check_in AND p_check_out = v_bloque.check_out) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'bloque_fijo',
      'mensaje', format('Esas fechas son parte de un bloque que se alquila completo: %s al %s.',
                        to_char(v_bloque.check_in, 'DD/MM'), to_char(v_bloque.check_out, 'DD/MM')),
      'bloque', jsonb_build_object('check_in', v_bloque.check_in, 'check_out', v_bloque.check_out));
  END IF;

  SELECT m.noches, m.dias_checkin INTO v_minimo, v_dias
    FROM minimos_noches m
   WHERE m.complejo_id = v_complejo.id
     AND daterange(m.desde, m.hasta, '[]') && daterange(p_check_in, p_check_out, '[)')
   LIMIT 1;

  IF v_minimo IS NULL THEN
    v_minimo := v_cfg.minimo_noches;
  END IF;

  IF v_noches < v_minimo THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'pocas_noches',
      'mensaje', format('Para esas fechas el mínimo es de %s noches.', v_minimo),
      'minimo', v_minimo);
  END IF;

  IF v_dias IS NOT NULL AND NOT (extract(dow FROM p_check_in)::SMALLINT = ANY (v_dias)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dia_de_entrada',
      'mensaje', 'Para esas fechas la entrada tiene que ser otro día de la semana.',
      'dias_permitidos', v_dias);
  END IF;

  IF p_personas IS NULL OR p_personas < 1 OR p_personas > v_unidad.capacidad_maxima THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'capacidad',
      'mensaje', format('%s admite hasta %s personas.', v_unidad.nombre, v_unidad.capacidad_maxima));
  END IF;

  -- ------------------------------------------------------------------
  -- Los tres frenos
  -- ------------------------------------------------------------------
  -- Van acá, después de las reglas y antes de cotizar: lo que se frena es el
  -- gasto, y las respuestas de arriba son las que le sirven a un huésped de
  -- verdad para corregir la fecha.
  --
  -- `liberar_vencidas` primero, porque si no, lo que ya venció contaría como
  -- vigente y alguien quedaría frenado por señas que no existen más.
  PERFORM public.liberar_vencidas(p_unidad);

  SELECT count(*) INTO v_vigentes
    FROM reservas r
   WHERE r.complejo_id = v_complejo.id
     AND r.estado = 'HOLD_TRANSFER'
     AND r.origen = 'web'
     AND lower(r.huesped_email) = lower(trim(coalesce(p_email, '')));

  IF v_vigentes >= (v_lim->>'por_mail')::int THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'demasiadas_tuyas',
      'mensaje', format(
        'Ya tenés %s reservas esperando transferencia con ese mail. Transferí alguna o esperá a que venza el plazo.',
        v_vigentes),
      'limite', (v_lim->>'por_mail')::int);
  END IF;

  SELECT count(*) INTO v_vigentes
    FROM reservas r
   WHERE r.complejo_id = v_complejo.id
     AND r.estado = 'HOLD_TRANSFER'
     AND r.origen = 'web';

  SELECT greatest((v_lim->>'piso_por_complejo')::int,
                  (v_lim->>'por_unidad_activa')::int * count(*)::int)
    INTO v_tope
    FROM unidades u
   WHERE u.complejo_id = v_complejo.id AND u.activa;

  IF v_vigentes >= v_tope THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'complejo_saturado',
      'mensaje', 'Hay muchas reservas esperando transferencia en este momento. Probá de nuevo en un rato, o escribinos.',
      'limite', v_tope);
  END IF;

  SELECT count(*) INTO v_vigentes
    FROM reservas r
   WHERE r.complejo_id = v_complejo.id
     AND r.origen = 'web'
     AND r.created_at > now() - INTERVAL '1 minute';

  IF v_vigentes >= (v_lim->>'por_minuto')::int THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'muy_rapido',
      'mensaje', 'Estamos recibiendo muchas reservas juntas. Esperá un minuto y probá de nuevo.',
      'limite', (v_lim->>'por_minuto')::int);
  END IF;

  v_cotiz := public.cotizar_estadia(p_unidad, p_check_in, p_check_out);
  IF NOT (v_cotiz->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_precio',
      'mensaje', 'Todavía no tenemos tarifa publicada para esas fechas. Escribinos y te confirmamos.',
      'detalle', v_cotiz);
  END IF;

  BEGIN
    INSERT INTO reservas (
      complejo_id, unidad_id, check_in, check_out,
      estado, origen,
      huesped_nombre, huesped_dni, huesped_email, huesped_telefono,
      personas, acompanantes, notas,
      importe, medio_pago,
      vence_el
    ) VALUES (
      v_complejo.id, p_unidad, p_check_in, p_check_out,
      'HOLD_TRANSFER', 'web',
      p_nombre, p_dni, p_email, p_telefono,
      p_personas, coalesce(p_acompanantes, '[]'::jsonb), p_notas,
      (v_cotiz->>'total')::numeric, p_medio_pago,
      now() + make_interval(hours => v_complejo.horas_vencimiento_sena)
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'ocupada',
        'mensaje', 'Alguien acaba de tomar esas noches. Probá con otras fechas o con otra unidad.');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'noches', (v_cotiz->>'noches')::int,
    'total', (v_cotiz->>'total')::numeric,
    'sena',  (v_cotiz->>'sena')::numeric,
    'vence_el', (SELECT vence_el FROM reservas WHERE id = v_id),
    -- Los datos para transferir viajan acá, con la reserva recién hecha, y no
    -- en una función que cualquiera pueda llamar con el slug. Ver abajo.
    'datos_transferencia', v_complejo.datos_transferencia,
    'whatsapp', v_complejo.whatsapp
  );
END;

$$;

REVOKE ALL ON FUNCTION public.crear_reserva(TEXT, UUID, DATE, DATE, SMALLINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_reserva(TEXT, UUID, DATE, DATE, SMALLINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated, service_role;

-- ============================================
-- El alias y el CBU dejan de estar al alcance de cualquiera
-- ============================================
-- `src/app/page.tsx` explicaba por qué los datos bancarios no iban en
-- `complejo_publico`:
--
--   «así no quedan en el HTML de cada visita, ni de cada robot que pase por la
--    página»
--
-- Pero `datos_para_transferir(p_slug TEXT)` estaba concedida a `anon`, así que
-- con la clave publicable y el slug —que es público— cualquiera obtenía alias,
-- CBU y titular con una llamada. El comentario afirmaba una protección que no
-- existía, que es peor que no tener el comentario.
--
-- El dato no es un secreto: es lo que el dueño le da a cualquiera que quiera
-- pagarle. El problema es juntarlos: con los slugs se arma una lista de
-- «negocio + CBU + WhatsApp» de toda la plataforma, que es exactamente el kit
-- de una estafa de reservas falsas.
--
-- Ahora hace falta el id de una reserva que esté esperando transferencia. El
-- huésped que acaba de reservar lo tiene; el robot que recorre slugs, no. Y
-- conseguir uno cuesta una reserva, que ahora está limitada.
DROP FUNCTION IF EXISTS public.datos_para_transferir(TEXT);

CREATE OR REPLACE FUNCTION public.datos_para_transferir(p_reserva UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'datos_transferencia', c.datos_transferencia,
           'whatsapp', c.whatsapp,
           'moneda', c.moneda
         )
    FROM reservas r
    JOIN complejos c ON c.id = r.complejo_id
   WHERE r.id = p_reserva
     AND r.estado = 'HOLD_TRANSFER';
$$;

REVOKE ALL ON FUNCTION public.datos_para_transferir(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.datos_para_transferir(UUID) TO anon, authenticated, service_role;

-- ============================================
-- «Te vas cuando quieras y te llevás tus datos»
-- ============================================
-- Eso dice la página, y hasta hoy no había con qué: ninguna función de
-- exportación en todo el producto. No era falso —lo podíamos hacer a mano con
-- una consulta— pero era una promesa sin código atrás, y el día que un cliente
-- se vaya enojado va a querer el archivo en el momento, no cuando podamos.
--
-- Devuelve TODO lo del complejo en un JSON: sus datos, sus unidades, sus
-- precios, sus reglas, sus bloqueos y sus reservas con los huéspedes. Valida
-- pertenencia con `es_miembro()` porque RLS no corre adentro de una función
-- `SECURITY DEFINER`.
CREATE OR REPLACE FUNCTION public.exportar_complejo(p_complejo UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v JSONB;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'exportado_el', now(),
    'complejo', to_jsonb(c.*),
    'unidades', coalesce((SELECT jsonb_agg(to_jsonb(u.*) ORDER BY u.orden)
                            FROM unidades u WHERE u.complejo_id = c.id), '[]'::jsonb),
    'periodos_precio', coalesce((SELECT jsonb_agg(to_jsonb(p.*) ORDER BY p.desde)
                            FROM periodos_precio p WHERE p.complejo_id = c.id), '[]'::jsonb),
    'precios_unidad', coalesce((SELECT jsonb_agg(to_jsonb(pu.*))
                            FROM precios_unidad pu
                            JOIN periodos_precio p ON p.id = pu.periodo_id
                           WHERE p.complejo_id = c.id), '[]'::jsonb),
    'minimos_noches', coalesce((SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.desde)
                            FROM minimos_noches m WHERE m.complejo_id = c.id), '[]'::jsonb),
    'bloques_fijos', coalesce((SELECT jsonb_agg(to_jsonb(b.*) ORDER BY b.check_in)
                            FROM bloques_fijos b WHERE b.complejo_id = c.id), '[]'::jsonb),
    'config_calendario', (SELECT to_jsonb(cc.*) FROM config_calendario cc WHERE cc.complejo_id = c.id),
    'reservas', coalesce((SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.check_in)
                            FROM reservas r WHERE r.complejo_id = c.id), '[]'::jsonb)
  ) INTO v
  FROM complejos c
  WHERE c.id = p_complejo;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.exportar_complejo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exportar_complejo(UUID) TO authenticated, service_role;
