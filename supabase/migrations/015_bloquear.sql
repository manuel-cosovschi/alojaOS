-- ============================================
-- Que el dueño pueda cerrar fechas
-- ============================================
-- `desbloquear()` existe desde la 009 y `bloquear()` no, lo cual es una
-- asimetría rara: el dueño puede deshacer algo que no puede hacer. El motivo es
-- histórico —la 009 salió de auditar el `owner-unblock` del sistema anterior,
-- que contestaba «listo» sin tocar nada durante siete meses— y arreglar el
-- desbloqueo era lo urgente. Esto cierra el par.
--
-- Cerrar fechas es de las cosas que un dueño hace más seguido: la semana que
-- viene la usa la familia, hay que pintar la cabaña tres, el fin de semana
-- largo lo tiene reservado un conocido por teléfono. Hoy eso se hace
-- escribiéndonos, y no debería.
--
-- ------------------------------------------------------------------
-- Un bloqueo es una reserva, y eso no es una simplificación
-- ------------------------------------------------------------------
-- Es una fila en `reservas` con estado BLOCKED, y por lo tanto la misma
-- restricción de exclusión que impide dos reservas sobre la misma noche impide
-- bloquear una noche vendida y vender una noche bloqueada. Una tabla aparte de
-- «fechas cerradas» habría necesitado su propia comprobación contra `reservas`,
-- y esa comprobación es exactamente lo que se mira antes de escribir y falla
-- entre dos peticiones simultáneas.
--
-- ------------------------------------------------------------------
-- Qué pasa cuando esas noches ya están vendidas
-- ------------------------------------------------------------------
-- No se dice «no se pudo» a secas. Se dice quién las tiene, porque el que
-- pregunta es el dueño del complejo y es el dato que necesita para decidir: si
-- la cabaña está vendida esa semana, o llama al huésped o cambia de fecha.
-- Devolver «ocupada» y nada más lo obliga a ir a buscar a otra pantalla.
--
-- No es una filtración: `es_miembro()` ya corrió, y lo que se devuelve es de su
-- propio complejo. Lo mismo mostrado a un visitante sí lo sería, y por eso
-- `noches_ocupadas()` —la que ve el huésped— no devuelve ningún nombre.
CREATE OR REPLACE FUNCTION public.bloquear(
  p_complejo UUID,
  p_unidad   UUID,
  p_desde    DATE,
  p_hasta    DATE,
  p_motivo   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      UUID;
  v_choque  RECORD;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde >= p_hasta THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fechas_invalidas',
      'mensaje', 'La fecha de salida tiene que ser posterior a la de entrada.');
  END IF;

  -- Que la unidad sea de este complejo lo comprueba igual el trigger
  -- `unidad_es_del_complejo`, pero levantaría una excepción y acá se puede
  -- contestar con una frase.
  IF NOT EXISTS (
    SELECT 1 FROM unidades WHERE id = p_unidad AND complejo_id = p_complejo
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'unidad_ajena',
      'mensaje', 'Esa unidad no es de este complejo.');
  END IF;

  -- Vencer antes de escribir: si no, una seña que ya murió impediría bloquear
  -- unas noches que en realidad están libres.
  PERFORM public.liberar_vencidas(p_unidad);

  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado,
                          origen, motivo_estado)
    VALUES (p_complejo, p_unidad, p_desde, p_hasta, 'BLOCKED', 'bloqueo',
            nullif(trim(coalesce(p_motivo, '')), ''))
    RETURNING id INTO v_id;
  EXCEPTION WHEN exclusion_violation THEN
    -- No se mira antes de escribir: se escribe y se atrapa el choque. Mirar
    -- antes deja una ventana entre la lectura y la escritura, y en esa ventana
    -- entra una reserva de la web.
    SELECT r.check_in, r.check_out, r.estado, r.huesped_nombre, r.motivo_estado
      INTO v_choque
      FROM reservas r
     WHERE r.unidad_id = p_unidad
       AND r.estado IN ('HOLD_TRANSFER', 'CONFIRMED', 'BLOCKED')
       AND r.noches && daterange(p_desde, p_hasta, '[)')
     ORDER BY r.check_in
     LIMIT 1;

    RETURN jsonb_build_object(
      'ok', false,
      'motivo', 'ocupada',
      'mensaje', CASE
        WHEN v_choque.estado = 'BLOCKED'
          THEN 'Esas noches ya están cerradas.'
        ELSE 'Esas noches ya están vendidas.'
      END,
      'choca_con', jsonb_build_object(
        'check_in', v_choque.check_in,
        'check_out', v_choque.check_out,
        'estado', v_choque.estado,
        'huesped', v_choque.huesped_nombre,
        'motivo', v_choque.motivo_estado
      )
    );
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bloquear(UUID, UUID, DATE, DATE, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.bloquear(UUID, UUID, DATE, DATE, TEXT) TO authenticated;

-- ============================================
-- Las fechas que el dueño tiene cerradas
-- ============================================
-- Para poder mostrarlas y reabrirlas. Devuelve sólo los bloqueos, no las
-- reservas: son dos listas distintas en la cabeza del dueño y mezclarlas haría
-- que buscara entre reservas de gente para encontrar la semana que cerró él.
--
-- Desde hoy hacia adelante: lo que cerró en marzo del año pasado no le sirve
-- para nada y le llenaría la pantalla.
CREATE OR REPLACE FUNCTION public.bloqueos_del_complejo(p_complejo UUID)
RETURNS TABLE (
  id            UUID,
  unidad_id     UUID,
  unidad_codigo TEXT,
  unidad_nombre TEXT,
  check_in      DATE,
  check_out     DATE,
  noches        INTEGER,
  motivo        TEXT,
  creado_el     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT r.id, r.unidad_id, u.codigo, u.nombre,
           r.check_in, r.check_out, (r.check_out - r.check_in),
           r.motivo_estado, r.created_at
      FROM reservas r
      JOIN unidades u ON u.id = r.unidad_id
     WHERE r.complejo_id = p_complejo
       AND r.estado = 'BLOCKED'
       AND r.check_out >= current_date
     ORDER BY r.check_in, u.orden;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bloqueos_del_complejo(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.bloqueos_del_complejo(UUID) TO authenticated;

-- ============================================
-- Reabrir una fecha por su id
-- ============================================
-- `desbloquear()` toma un rango porque así lo pedía el panel viejo. Para una
-- lista en pantalla, el id es lo que corresponde: el dueño aprieta «reabrir» en
-- una fila, no escribe dos fechas. Y por id no hay forma de reabrir de más por
-- haberse equivocado en un rango.
CREATE OR REPLACE FUNCTION public.reabrir(p_bloqueo UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v reservas%ROWTYPE;
BEGIN
  SELECT * INTO v FROM reservas WHERE id = p_bloqueo FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  IF NOT public.es_miembro(v.complejo_id) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Que no se pueda «reabrir» la reserva de un huésped. Es un botón que en una
  -- lista de bloqueos no debería poder tocar una reserva vendida ni por error
  -- de programación ni por un id pegado a mano.
  IF v.estado <> 'BLOCKED' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_es_un_bloqueo',
      'estado', v.estado,
      'mensaje', 'Eso no es una fecha cerrada por vos: es una reserva.');
  END IF;

  UPDATE reservas
     SET estado = 'CANCELLED',
         cancelada_el = now(),
         motivo_estado = 'Reabierta por el dueño.'
   WHERE id = p_bloqueo;

  RETURN jsonb_build_object('ok', true, 'check_in', v.check_in, 'check_out', v.check_out);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reabrir(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reabrir(UUID) TO authenticated;
