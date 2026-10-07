-- ============================================
-- AlojaOS — crear una reserva
-- ============================================
-- Un solo camino para las tres formas de ocupar una noche: el huésped desde la
-- página, el dueño cargando a mano la que entró por teléfono, y el bloqueo que
-- el dueño se guarda para él. En el sistema viejo eran tres workflows distintos
-- con el chequeo de superposición copiado en cada uno (y en uno de los tres
-- directamente no estaba).
--
-- Cómo evita la doble reserva: NO mira antes de escribir. Escribe, y si la
-- restricción de exclusión la rechaza, traduce el error. Esa es la diferencia
-- entera: entre mirar y escribir entra otro, pero entre escribir y escribir no
-- entra nadie — lo resuelve el índice.
--
-- Lo que SÍ se valida antes es lo que la base no puede saber sola: que las
-- fechas caigan en la ventana de reservas, que lleguen al mínimo de noches, que
-- el día de entrada esté permitido, que un bloque fijo se tome entero y que la
-- unidad tenga precio para todas las noches.
--
-- El precio lo calcula la base, no el navegador. El importe que llega en el
-- pedido es un dato del cliente y un dato del cliente no se cree: en el sistema
-- viejo `create-reservation.js` guardaba el `importe` que mandaba la página.

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
BEGIN
  -- ------------------------------------------------------------------
  -- El complejo y la unidad
  -- ------------------------------------------------------------------
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

  -- ------------------------------------------------------------------
  -- Las fechas
  -- ------------------------------------------------------------------
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_in >= p_check_out THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fechas_invalidas',
      'mensaje', 'La fecha de salida tiene que ser posterior a la de entrada.');
  END IF;

  -- "Hoy" en hora de Argentina, no del servidor. Entre las 21 y las 24 un
  -- servidor en UTC ya está en el día siguiente, y con eso rechazaría como
  -- "pasada" una reserva para mañana que todavía es para mañana.
  v_hoy := (now() AT TIME ZONE v_complejo.zona_horaria)::date;

  SELECT * INTO v_cfg FROM config_calendario WHERE complejo_id = v_complejo.id;
  IF NOT FOUND THEN
    -- Sin reglas cargadas no se inventa ninguna: la página se planta. Es lo que
    -- ya hacía `calendar-config.js` y está bien.
    RETURN jsonb_build_object('ok', false, 'motivo', 'calendario_sin_configurar');
  END IF;

  v_desde := greatest(coalesce(v_cfg.primera_fecha, v_hoy), v_hoy);
  IF p_check_in < v_desde THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'antes_de_la_ventana',
      'mensaje', format('Se puede reservar desde el %s.', to_char(v_desde, 'DD/MM/YYYY')));
  END IF;

  -- `ultima_fecha` es la última NOCHE reservable, así que la última salida
  -- posible es el día siguiente.
  IF p_check_out > v_cfg.ultima_fecha + 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'despues_de_la_ventana',
      'mensaje', format('Por el momento sólo se puede reservar hasta el %s.',
                        to_char(v_cfg.ultima_fecha, 'DD/MM/YYYY')));
  END IF;

  v_noches := p_check_out - p_check_in;

  -- ------------------------------------------------------------------
  -- Bloques que van enteros
  -- ------------------------------------------------------------------
  -- Alcanza con tocarlo: quien pide tres de las cuatro noches de un finde largo
  -- le deja al dueño una noche suelta que no le va a alquilar a nadie.
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

  -- ------------------------------------------------------------------
  -- Mínimo de noches y día de entrada
  -- ------------------------------------------------------------------
  -- Un tramo que toca la estadía manda sobre el mínimo general. Como los tramos
  -- no se pueden solapar (restricción en 004), hay como mucho uno.
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

  -- `extract(dow)` da 0 para domingo y 6 para sábado, igual que `getDay()` del
  -- navegador, así que las reglas cargadas significan lo mismo en los dos lados.
  IF v_dias IS NOT NULL AND NOT (extract(dow FROM p_check_in)::SMALLINT = ANY (v_dias)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'dia_de_entrada',
      'mensaje', 'Para esas fechas la entrada tiene que ser otro día de la semana.',
      'dias_permitidos', v_dias);
  END IF;

  -- ------------------------------------------------------------------
  -- Capacidad
  -- ------------------------------------------------------------------
  IF p_personas IS NULL OR p_personas < 1 OR p_personas > v_unidad.capacidad_maxima THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'capacidad',
      'mensaje', format('%s admite hasta %s personas.', v_unidad.nombre, v_unidad.capacidad_maxima));
  END IF;

  -- ------------------------------------------------------------------
  -- El precio
  -- ------------------------------------------------------------------
  v_cotiz := public.cotizar_estadia(p_unidad, p_check_in, p_check_out);
  IF NOT (v_cotiz->>'ok')::boolean THEN
    -- Una noche sin precio cargado no se cotiza. Cobrar de menos sin que nadie
    -- se entere es peor que pedirle a la persona que espere la confirmación.
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_precio',
      'mensaje', 'Todavía no tenemos tarifa publicada para esas fechas. Escribinos y te confirmamos.',
      'detalle', v_cotiz);
  END IF;

  -- ------------------------------------------------------------------
  -- Escribir
  -- ------------------------------------------------------------------
  -- Soltar antes lo que ya venció: si no, un hold muerto de otra persona le
  -- rechaza la reserva a esta.
  PERFORM public.liberar_vencidas(p_unidad);

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
      -- Acá es donde el sistema viejo escribía la segunda reserva encima de la
      -- primera. La restricción no la deja, y el que llegó tarde se entera.
      RETURN jsonb_build_object('ok', false, 'motivo', 'ocupada',
        'mensaje', 'Alguien acaba de tomar esas noches. Probá con otras fechas o con otra unidad.');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'noches', (v_cotiz->>'noches')::int,
    'total', (v_cotiz->>'total')::numeric,
    'sena',  (v_cotiz->>'sena')::numeric,
    'vence_el', (SELECT vence_el FROM reservas WHERE id = v_id)
  );
END;
$$;

-- La página pública la llama sin sesión, así que `anon` necesita poder
-- ejecutarla. Es seguro porque la función no recibe el estado ni el importe:
-- los decide ella. Lo único que puede hacer quien la llame es pedir un HOLD.
GRANT EXECUTE ON FUNCTION public.crear_reserva(
  TEXT, UUID, DATE, DATE, SMALLINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) TO anon, authenticated;

-- ============================================
-- El slug no se cambia
-- ============================================
-- El dueño manda el link de su página por WhatsApp a cada huésped. Si pudiera
-- cambiar el slug, todos esos links dejarían de funcionar y los huéspedes con
-- una reserva en curso no podrían ver en qué quedó.
CREATE OR REPLACE FUNCTION public.slug_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug <> OLD.slug THEN
    RAISE EXCEPTION 'La dirección de la página no se puede cambiar.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER complejos_slug_inmutable
  BEFORE UPDATE OF slug ON complejos
  FOR EACH ROW EXECUTE FUNCTION public.slug_inmutable();
