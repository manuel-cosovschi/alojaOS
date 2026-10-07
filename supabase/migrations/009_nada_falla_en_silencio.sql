-- ============================================
-- AlojaOS — que nada conteste que está bien sin estarlo
-- ============================================
-- Esta migración sale de una auditoría del sistema anterior, y de una sola
-- frase suya: todos sus errores tenían la misma forma, **devolvían éxito
-- mientras no hacían nada**. No había pantallas rojas ni funciones caídas; había
-- respuestas que parecían correctas. La planilla devolvía las filas con la plata
-- en blanco. La subida del comprobante contestaba "ok" sin guardar el archivo.
-- El desbloqueo contestaba "desbloqueado" sin desbloquear. Dos de esos
-- estuvieron rotos desde el primer día y se encontraron meses después, cuando
-- alguien fue a buscar un número concreto y no cerraba.
--
-- Revisé lo que llevo escrito contra esa forma y encontré un caso igual, que
-- arreglo acá.
--
-- ------------------------------------------------------------------
-- El caso
-- ------------------------------------------------------------------
-- El panel de aquel sistema listaba las señas pendientes filtrando por
-- `expMs > nowMs`: mostraba sólo las que no habían vencido. Era correcto
-- MIENTRAS el mecanismo que las vencía funcionara — y ese mecanismo era un
-- script invisible, que no estaba ni en el repositorio ni en los workflows.
--
-- El problema no es el filtro. El problema es que **"0 pendientes" es también
-- lo que el panel diría si el mecanismo estuviera muerto.** Las dos situaciones
-- —no hay nadie esperando, y el sistema dejó de vencer— se ven exactamente
-- igual, y la que importa no avisa.
--
-- Si el panel de AlojaOS leyera `reservas` con un filtro así, tendría el mismo
-- agujero. Por eso la lista de pendientes no se arma con un filtro:
--
--   1. vence primero lo que haya que vencer, y
--   2. devuelve lo que quedó vivo, que entonces está vivo de verdad.
--
-- Y por las dudas, `salud_vencimientos()` contesta la pregunta que allá no se
-- podía contestar: ¿esto sigue funcionando? Si alguna vez devuelve
-- `atrasadas > 0`, hay un hold que debería estar vencido y no lo está.

-- ============================================
-- Las señas que de verdad están esperando
-- ============================================
-- SECURITY DEFINER para poder vencer (escribe) y para leer sin depender de las
-- policies. Por eso mismo chequea la pertenencia ADENTRO: sin ese chequeo esta
-- función le serviría a cualquiera con una cuenta el nombre, el teléfono y el
-- documento de los huéspedes de otro complejo, que es el peor error posible en
-- este producto.
CREATE OR REPLACE FUNCTION public.reservas_pendientes(p_complejo UUID)
RETURNS TABLE (
  id               UUID,
  unidad_id        UUID,
  unidad_codigo    TEXT,
  check_in         DATE,
  check_out        DATE,
  huesped_nombre   TEXT,
  huesped_telefono TEXT,
  huesped_email    TEXT,
  personas         SMALLINT,
  importe          NUMERIC,
  vence_el         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Vencer y después leer, no filtrar al leer. Es la diferencia entre "no hay
  -- nadie esperando" y "no sé si el sistema sigue venciendo".
  PERFORM public.liberar_vencidas();

  RETURN QUERY
    SELECT r.id, r.unidad_id, u.codigo, r.check_in, r.check_out,
           r.huesped_nombre, r.huesped_telefono, r.huesped_email,
           r.personas, r.importe, r.vence_el, r.created_at
      FROM reservas r
      JOIN unidades u ON u.id = r.unidad_id
     WHERE r.complejo_id = p_complejo
       AND r.estado = 'HOLD_TRANSFER'
     ORDER BY r.vence_el;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reservas_pendientes(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reservas_pendientes(UUID) TO authenticated;

-- ============================================
-- ¿El vencimiento sigue funcionando?
-- ============================================
-- La pregunta que en el sistema anterior no se podía contestar. Allá el
-- mecanismo era un Apps Script pegado a la planilla, sin documentar y sin
-- mención en ningún repositorio; la última señal de que estaba vivo era una
-- reserva de agosto con el texto "Auto-expired" en una columna, y para saber si
-- seguía andando había que hacer una reserva de prueba y esperar.
--
-- Acá el vencimiento no es una tarea aparte que pueda morirse sola: corre
-- adentro de las mismas funciones que consultan disponibilidad y crean reservas,
-- así que si esas andan, aquello anda. Esta función es el testigo de eso:
-- `atrasadas` tiene que ser siempre 0.
CREATE OR REPLACE FUNCTION public.salud_vencimientos(p_complejo UUID)
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
    -- Holds que ya tendrían que estar vencidos y siguen ocupando noches. Si
    -- esto no es 0, hay un camino que escribe holds sin pasar por las
    -- funciones que los vencen.
    'atrasadas', count(*) FILTER (WHERE estado = 'HOLD_TRANSFER' AND vence_el < now()),
    'esperando', count(*) FILTER (WHERE estado = 'HOLD_TRANSFER' AND vence_el >= now()),
    'vencidas_total', count(*) FILTER (WHERE estado = 'EXPIRED'),
    -- Cuándo venció la última. Sirve para lo mismo que allá servía la columna
    -- con el texto "Auto-expired": saber que el mecanismo dio señales de vida.
    'ultimo_vencimiento', max(updated_at) FILTER (WHERE estado = 'EXPIRED')
  ) INTO v
    FROM reservas WHERE complejo_id = p_complejo;

  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.salud_vencimientos(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.salud_vencimientos(UUID) TO authenticated;

-- ============================================
-- Un bloqueo que no bloquea nada no se puede guardar
-- ============================================
-- Allá `owner-unblock` contestaba `{ok: true, deleted_count: 1}` siempre, sin
-- tocar nada: el panel decía "listo" y la fecha seguía bloqueada. Estuvo así
-- siete meses.
--
-- La forma de que eso no pase no es revisar mejor el código del desbloqueo: es
-- que la operación no pueda decir que hizo algo sin haberlo hecho. Un bloqueo
-- del dueño es una fila, igual que una reserva, así que desbloquear es cambiarle
-- el estado y la base cuenta las filas que cambió. No hay dónde inventar un
-- `deleted_count`.
--
-- Lo que falta cerrar es el otro lado: un bloqueo sin fechas válidas no bloquea
-- nada y hoy se podría guardar igual, y un bloqueo "vacío" es justamente una
-- fila que parece estar haciendo algo.
CREATE OR REPLACE FUNCTION public.desbloquear(
  p_complejo UUID,
  p_unidad   UUID,
  p_desde    DATE,
  p_hasta    DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuantas INTEGER;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde >= p_hasta THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fechas_invalidas');
  END IF;

  UPDATE reservas
     SET estado = 'CANCELLED',
         cancelada_el = now(),
         motivo_estado = 'Desbloqueada por el dueño.'
   WHERE complejo_id = p_complejo
     AND unidad_id = p_unidad
     AND estado = 'BLOCKED'
     AND noches && daterange(p_desde, p_hasta, '[)');

  GET DIAGNOSTICS v_cuantas = ROW_COUNT;

  -- Cero filas no es un error, pero tampoco es "listo": es "no había nada
  -- bloqueado ahí". El panel tiene que poder decir la diferencia, que es
  -- exactamente lo que allá no podía.
  RETURN jsonb_build_object(
    'ok', true,
    'desbloqueadas', v_cuantas,
    'habia_algo', v_cuantas > 0
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.desbloquear(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.desbloquear(UUID, UUID, DATE, DATE) TO authenticated;
