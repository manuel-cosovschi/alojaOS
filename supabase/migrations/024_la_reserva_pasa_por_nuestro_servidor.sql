-- ============================================
-- `crear_reserva` deja de ser llamable desde afuera
-- ============================================
-- La 023 puso tres frenos adentro de la función y funcionan: el ataque de la
-- auditoría pasó de catorce noches a tres. Pero dejó una tensión que el arnés
-- encontró enseguida —tres aserciones que antes pasaban empezaron a fallar—, y
-- vale escribirla porque es el motivo de este archivo:
--
--   · un freno de ritmo lo bastante bajo como para cortar un script **también
--     corta una ráfaga legítima**, y el arnés es exactamente una ráfaga;
--   · uno lo bastante alto como para no molestar a nadie **no corta el script**.
--
-- No hay número que resuelva las dos cosas, porque el problema no es el ritmo:
-- es que no sabemos **quién** está llamando. Desde la base, un script y un fin
-- de semana largo se ven igual.
--
-- ------------------------------------------------------------------
-- Lo que sí distingue: la IP
-- ------------------------------------------------------------------
-- Nuestro servidor la conoce; la base, no. Y hasta hoy daba lo mismo, porque
-- `crear_reserva` estaba concedida a `anon`: se podía llamar derecho por
-- `/rest/v1/rpc/crear_reserva` con la clave publicable, salteándose el
-- servidor. Por eso el freno tenía que estar en la base.
--
-- Acá se cierra esa puerta. A partir de esta migración:
--
--   · **la única forma de crear una reserva es por nuestro servidor**, que la
--     llama con la clave de servicio;
--   · el servidor le pasa la IP de quien está reservando, que no se puede
--     falsear desde el navegador porque la pone la red, no el pedido;
--   · el freno por IP es el preciso —tres reservas cada diez minutos desde la
--     misma IP, contando TODOS los complejos— y el de ritmo por complejo sube
--     a veinte por minuto, que ningún complejo de 3 a 15 unidades toca jamás.
--
-- Lo que la superficie pública conserva es sólo lectura: ver el complejo,
-- cotizar, ver qué noches están ocupadas y ver el estado de una reserva. Nada
-- que escriba.
--
-- Y el tope de señas vigentes por complejo se queda igual, porque es el que
-- acota el daño si algo de lo de arriba falla: más de dos por unidad activa no
-- se puede tener esperando, pase lo que pase.

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
    -- Veinte por minuto no lo toca ningún complejo de este tamaño ni en su
    -- mejor día. Queda como red por si alguna vez algo llama en bucle.
    'por_minuto', 20,
    -- El que importa ahora. Diez minutos y no uno, porque una ráfaga desde una
    -- IP es un script aunque venga despacio.
    'por_ip', 3,
    'minutos_de_la_ip', 10
  );
$$;

REVOKE ALL ON FUNCTION public.limites_de_reserva() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limites_de_reserva() TO authenticated, service_role;

-- ------------------------------------------------------------------
-- De dónde vino cada reserva
-- ------------------------------------------------------------------
-- Una columna y no una tabla aparte: se escribe una vez, se lee para contar, y
-- se va con la reserva cuando la reserva se va. Admite nulo porque las
-- reservas que ya existen no la tienen, y porque el dueño que carga una a mano
-- no viene de ninguna IP.
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS origen_ip TEXT;

COMMENT ON COLUMN reservas.origen_ip IS
  'La IP desde la que se reservó, para poder frenar a quien hace veinte. La pone '
  'nuestro servidor, que es el único que puede llamar a crear_reserva().';

CREATE INDEX IF NOT EXISTS reservas_origen_ip_idx
  ON reservas (origen_ip, created_at DESC)
  WHERE origen_ip IS NOT NULL;

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
  p_notas        TEXT DEFAULT NULL,
  -- La pone nuestro servidor. Va al final y con valor por omisión para que las
  -- llamadas que ya existen sigan compilando.
  p_ip           TEXT DEFAULT NULL
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
  v_ip_lim    INT;
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

  -- El freno que distingue de verdad: la IP. La pone nuestro servidor, que es
  -- el único que puede llamar a esta función, y no se puede falsear desde el
  -- navegador porque la pone la red y no el pedido. Cuenta TODOS los complejos:
  -- un script que recorre la plataforma usa la misma IP para todos.
  IF p_ip IS NOT NULL THEN
    SELECT count(*) INTO v_ip_lim
      FROM reservas r
     WHERE r.origen_ip = p_ip
       AND r.origen = 'web'
       AND r.created_at > now() - make_interval(mins => (v_lim->>'minutos_de_la_ip')::int);

    IF v_ip_lim >= (v_lim->>'por_ip')::int THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'muy_rapido',
        'mensaje', 'Ya hiciste varias reservas desde acá hace un momento. Esperá unos minutos y probá de nuevo.',
        'limite', (v_lim->>'por_ip')::int);
    END IF;
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
      vence_el, origen_ip
    ) VALUES (
      v_complejo.id, p_unidad, p_check_in, p_check_out,
      'HOLD_TRANSFER', 'web',
      p_nombre, p_dni, p_email, p_telefono,
      p_personas, coalesce(p_acompanantes, '[]'::jsonb), p_notas,
      (v_cotiz->>'total')::numeric, p_medio_pago,
      now() + make_interval(hours => v_complejo.horas_vencimiento_sena), p_ip
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

-- ------------------------------------------------------------------
-- Y la puerta se cierra
-- ------------------------------------------------------------------
-- La versión vieja, la de doce argumentos, se va: si quedara, `anon` la seguiría
-- teniendo concedida y todo esto sería decorativo. PostgREST elige por los
-- argumentos del pedido, así que dejar las dos es dejar la de antes.
DROP FUNCTION IF EXISTS public.crear_reserva(TEXT, UUID, DATE, DATE, SMALLINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT);

REVOKE ALL ON FUNCTION public.crear_reserva(TEXT, UUID, DATE, DATE, SMALLINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_reserva(TEXT, UUID, DATE, DATE, SMALLINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) TO service_role;
