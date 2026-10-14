-- ============================================
-- Que el dueño cargue sus propios precios
-- ============================================
-- Hasta hoy los precios los cargo yo con un INSERT. Eso funciona para el
-- primer cliente y no escala a cinco: el precio de la temporada que viene lo
-- decide el dueño en diciembre, muchas veces un domingo, y tener que
-- escribirnos para cambiarlo significa que no lo cambia.
--
-- ------------------------------------------------------------------
-- El agujero que nadie ve
-- ------------------------------------------------------------------
-- Un período de precios tiene una fila por unidad. Si falta una,
-- `cotizar_estadia()` devuelve `noche_sin_precio` y la página no cotiza: la
-- cabaña queda **invendible toda la temporada** y en la pantalla no se ve nada
-- raro. El calendario la muestra libre, el huésped elige las fechas, y recién
-- al pedir el precio aparece que no hay.
--
-- Es exactamente la clase de falla que este sistema existe para no tener: algo
-- que contesta que está bien sin estar bien. Así que además de las funciones
-- para escribir, acá va `salud_de_los_precios()`, que recorre la ventana de
-- reservas y dice qué unidad no se puede cotizar y desde cuándo.
--
-- La función de escritura **no se niega** a dejar una unidad sin precio. Lo que
-- no puede pasar es que sea a propósito sin que nadie lo sepa, y de eso se
-- encarga la otra.
--
-- ------------------------------------------------------------------
-- La unidad que está fuera de circulación no es un agujero
-- ------------------------------------------------------------------
-- `unidades.activa` ya existe desde la 001, y ya lo respetan los dos lugares
-- que importan: `complejo_publico()` no publica las inactivas y
-- `crear_reserva()` no deja reservarlas. Así que una unidad inactiva sin precio
-- **no es un problema**: no se puede reservar por otro motivo.
--
-- `salud_de_los_precios()` cuenta sólo las activas. La primera versión contaba
-- todas, y eso le habría puesto un rojo permanente al dueño que saca la cabaña
-- chica en invierno —que es el caso normal, no el raro—. Es el mismo error que
-- cometí en `borrar_periodo()`: avisar de algo que no es un problema.
--
-- `periodos_del_complejo()`, al contrario, las lista TODAS, con su `activa`.
-- Porque los precios se reemplazan enteros: si el formulario no mostrara la
-- unidad inactiva, guardar le borraría el precio, y el día que el dueño la
-- vuelve a activar quedaría invendible sin que nada lo diga.
--
-- ------------------------------------------------------------------
-- Por qué las unidades se validan a mano
-- ------------------------------------------------------------------
-- Estas funciones son SECURITY DEFINER, y por lo tanto **saltean RLS**. La
-- policy de `precios_unidad` dice `es_miembro(complejo_de_unidad(unidad_id))`,
-- pero adentro de una función DEFINER esa policy no corre. Sin la validación
-- explícita de más abajo, un dueño podría mandar el id de una unidad de otro
-- complejo y ponerle precio. El aislamiento acá lo sostiene el código, así que
-- está probado en `prueba-base.sql` y en `prueba-dos-duenos.mts`.

-- ============================================
-- Leer los períodos con sus precios
-- ============================================
-- Devuelve los precios como JSONB y no como filas sueltas porque la pantalla
-- los muestra juntos —una fila por período, una columna por unidad— y armar eso
-- desde filas sueltas en el cliente es un agrupado que se puede hacer una vez
-- acá.
--
-- Incluye las unidades SIN precio con `precio: null` en vez de omitirlas: un
-- hueco que no aparece en la lista es un hueco que la pantalla no puede
-- mostrar, y mostrarlo es la mitad del punto.
--
-- Y las inactivas también, con su `activa` al lado. Omitirlas haría que guardar
-- el formulario les borre el precio —los precios se reemplazan enteros— y el
-- día que el dueño vuelva a activar la unidad quedaría invendible en silencio.
CREATE OR REPLACE FUNCTION public.periodos_del_complejo(p_complejo UUID)
RETURNS TABLE (
  id       UUID,
  desde    DATE,
  hasta    DATE,
  noches   INTEGER,
  etiqueta TEXT,
  precios  JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.desde,
    p.hasta,
    (p.hasta - p.desde + 1)::INTEGER AS noches,
    p.etiqueta,
    coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'unidad_id', u.id,
                 'codigo',    u.codigo,
                 'nombre',    u.nombre,
                 'activa',    u.activa,
                 'precio',    pu.precio
               ) ORDER BY u.orden, u.codigo
             )
        FROM unidades u
        LEFT JOIN precios_unidad pu ON pu.periodo_id = p.id AND pu.unidad_id = u.id
       WHERE u.complejo_id = p_complejo
    ), '[]'::JSONB) AS precios
  FROM periodos_precio p
  WHERE p.complejo_id = p_complejo
  ORDER BY p.desde;
END;
$$;

-- ============================================
-- Guardar un período (alta y edición en la misma función)
-- ============================================
-- Una sola función para las dos cosas porque el dueño hace el mismo gesto:
-- «este tramo cuesta esto». `p_periodo` NULL es un alta.
--
-- El solape lo decide la restricción `periodos_sin_solape`, no una lectura
-- previa. Dos períodos que se pisan dejan el precio de una noche a suerte del
-- orden en que se lean las filas, y mirar antes de escribir deja la ventana
-- donde dos altas simultáneas pasan las dos.
--
-- Cuando choca, dice CON QUÉ período choca, por el mismo motivo que `bloquear()`
-- dice con qué reserva: el dueño necesita saber qué tramo mover, y «se pisa con
-- algo» lo manda a buscarlo a mano.
CREATE OR REPLACE FUNCTION public.guardar_periodo(
  p_complejo UUID,
  p_desde    DATE,
  p_hasta    DATE,
  p_precios  JSONB,
  p_etiqueta TEXT DEFAULT NULL,
  p_periodo  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id       UUID;
  v_choque   RECORD;
  v_unidad   UUID;
  v_precio   NUMERIC(12,2);
  v_ajenas   INTEGER;
  v_cuantos  INTEGER := 0;
  v_clave    TEXT;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fechas_invalidas',
      'mensaje', 'La fecha de fin no puede ser anterior a la de inicio.');
  END IF;

  IF p_precios IS NULL OR jsonb_typeof(p_precios) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'precios_invalidos',
      'mensaje', 'Faltan los precios.');
  END IF;

  -- ----------------------------------------------------------------
  -- Validar el payload ANTES de castear nada
  -- ----------------------------------------------------------------
  -- `p_precios` es `{unidad_id: precio}` y viene del cliente. Un `::UUID` o un
  -- `::NUMERIC` sobre una clave o un valor cualquiera levanta
  -- `invalid_text_representation`, que sale a la pantalla como «no pudimos
  -- hacerlo» y no dice qué está mal. Así que primero se comprueba la forma con
  -- expresiones regulares —que no fallan— y sólo después se castea.
  SELECT count(*) INTO v_ajenas
    FROM jsonb_object_keys(p_precios) AS k(clave)
   WHERE k.clave !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  IF v_ajenas > 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'precios_invalidos',
      'mensaje', 'Los precios vinieron mal armados.');
  END IF;

  -- Las unidades del payload tienen que ser de ESTE complejo. Ver el comentario
  -- del encabezado: la policy de `precios_unidad` no corre adentro de una
  -- función DEFINER, así que sin esto el id de una unidad ajena pasaría.
  SELECT count(*) INTO v_ajenas
    FROM jsonb_object_keys(p_precios) AS k(clave)
   WHERE NOT EXISTS (
     SELECT 1 FROM unidades u
      WHERE u.id = (k.clave)::UUID AND u.complejo_id = p_complejo
   );

  IF v_ajenas > 0 THEN
    RAISE EXCEPTION 'Alguna de esas unidades no es de ese complejo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Un valor vacío o nulo significa «esta unidad no tiene precio en este
  -- tramo», y es válido. Cualquier otra cosa que no sea un número, no.
  FOR v_clave IN
    SELECT key FROM jsonb_each(p_precios)
     WHERE nullif(btrim(coalesce(value #>> '{}', '')), '') IS NOT NULL
       AND btrim(value #>> '{}') !~ '^[0-9]+([.,][0-9]{1,2})?$'
  LOOP
    RETURN jsonb_build_object('ok', false, 'motivo', 'precio_invalido',
      'mensaje', format('El precio de %s no es un número.',
        (SELECT nombre FROM unidades WHERE id = v_clave::UUID)));
  END LOOP;

  -- Cero y los negativos los rechaza el CHECK de la tabla, pero el mensaje que
  -- levanta Postgres no le dice nada al dueño. Esto se adelanta para nombrar la
  -- unidad. (El `!~ '^[0-9]'` de arriba ya descartó el signo menos, así que acá
  -- lo único que puede quedar es el cero.)
  FOR v_clave, v_precio IN
    SELECT key, (replace(nullif(btrim(value #>> '{}'), ''), ',', '.'))::NUMERIC
      FROM jsonb_each(p_precios)
  LOOP
    IF v_precio IS NOT NULL AND v_precio <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'precio_no_positivo',
        'mensaje', format('El precio de %s tiene que ser mayor que cero.',
          (SELECT nombre FROM unidades WHERE id = v_clave::UUID)));
    END IF;
  END LOOP;

  BEGIN
    IF p_periodo IS NULL THEN
      INSERT INTO periodos_precio (complejo_id, desde, hasta, etiqueta)
      VALUES (p_complejo, p_desde, p_hasta, nullif(btrim(coalesce(p_etiqueta, '')), ''))
      RETURNING id INTO v_id;
    ELSE
      -- El `complejo_id` en el WHERE no es redundante: sin él, el id de un
      -- período ajeno pasaría la comprobación de `es_miembro` del complejo
      -- propio y editaría el período del vecino.
      UPDATE periodos_precio
         SET desde = p_desde,
             hasta = p_hasta,
             etiqueta = nullif(btrim(coalesce(p_etiqueta, '')), '')
       WHERE id = p_periodo AND complejo_id = p_complejo
      RETURNING id INTO v_id;

      IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe',
          'mensaje', 'Ese período ya no está.');
      END IF;
    END IF;
  EXCEPTION
    WHEN exclusion_violation THEN
      -- Se busca el período que se pisa DESPUÉS de que la restricción dijo que
      -- hay uno. Buscarlo antes sería la lectura previa que esto evita.
      SELECT o.desde, o.hasta, o.etiqueta INTO v_choque
        FROM periodos_precio o
       WHERE o.complejo_id = p_complejo
         AND (p_periodo IS NULL OR o.id <> p_periodo)
         AND daterange(o.desde, o.hasta, '[]') && daterange(p_desde, p_hasta, '[]')
       ORDER BY o.desde
       LIMIT 1;

      RETURN jsonb_build_object(
        'ok', false,
        'motivo', 'se_pisa',
        'mensaje', 'Ese tramo se pisa con otro período que ya tenés cargado.',
        'choca_con', jsonb_build_object(
          'desde', v_choque.desde,
          'hasta', v_choque.hasta,
          'etiqueta', v_choque.etiqueta
        )
      );
  END;

  -- Los precios se reemplazan enteros: lo que no viene en el payload se borra.
  -- Es lo que espera el que manda un formulario completo, y deja «sacarle el
  -- precio a esta unidad» como algo posible (vaciar el campo) en vez de algo
  -- que haya que hacer por otro lado.
  DELETE FROM precios_unidad pu
   WHERE pu.periodo_id = v_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p_precios) AS e(clave, valor)
        WHERE (e.clave)::UUID = pu.unidad_id
          AND e.valor <> 'null'::JSONB
          AND nullif(btrim(e.valor #>> '{}'), '') IS NOT NULL
     );

  FOR v_unidad, v_precio IN
    SELECT (key)::UUID,
           (replace(nullif(btrim(value #>> '{}'), ''), ',', '.'))::NUMERIC
      FROM jsonb_each(p_precios)
  LOOP
    IF v_precio IS NOT NULL THEN
      INSERT INTO precios_unidad (periodo_id, unidad_id, precio)
      VALUES (v_id, v_unidad, v_precio)
      ON CONFLICT (periodo_id, unidad_id) DO UPDATE SET precio = EXCLUDED.precio;
      v_cuantos := v_cuantos + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'era_alta', p_periodo IS NULL,
    'unidades_con_precio', v_cuantos,
    'noches', p_hasta - p_desde + 1
  );
END;
$$;

-- ============================================
-- Borrar un período
-- ============================================
-- Las reservas ya hechas no se tocan: guardan su propio importe cotizado, así
-- que borrar el período no les cambia el precio. Lo que se rompe es la
-- cotización de las noches futuras, y eso lo levanta `salud_de_los_precios()`
-- en la pantalla siguiente.
--
-- Por eso devuelve cuántas noches de la ventana de reservas quedan sin precio
-- después de borrar: el dueño que saca un período por error se entera en el
-- acto, no cuando un huésped no puede reservar.
CREATE OR REPLACE FUNCTION public.borrar_periodo(p_periodo UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complejo UUID;
  v_desde    DATE;
  v_hasta    DATE;
  v_hoy      DATE;
  v_vdesde   DATE;
  v_vhasta   DATE;
  v_huecos   INTEGER := 0;
BEGIN
  SELECT complejo_id, desde, hasta INTO v_complejo, v_desde, v_hasta
    FROM periodos_precio WHERE id = p_periodo;

  IF v_complejo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe',
      'mensaje', 'Ese período ya no está.');
  END IF;

  IF NOT public.es_miembro(v_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- `precios_unidad` cae por el ON DELETE CASCADE de su clave foránea.
  DELETE FROM periodos_precio WHERE id = p_periodo;

  -- Las noches que quedaron sin precio se cuentan sólo DENTRO de la ventana de
  -- reservas, no en todo el tramo borrado.
  --
  -- La primera versión contaba el tramo entero desde hoy, y por lo tanto
  -- avisaba de noches que están más allá de `ultima_fecha`: noches que nadie
  -- puede reservar, con precio o sin él. Un aviso sobre algo que no es un
  -- problema es peor que ninguno, porque es el que enseña a ignorar los avisos.
  SELECT (now() AT TIME ZONE c.zona_horaria)::DATE INTO v_hoy
    FROM complejos c WHERE c.id = v_complejo;

  SELECT greatest(v_hoy, coalesce(cc.primera_fecha, v_hoy)), cc.ultima_fecha
    INTO v_vdesde, v_vhasta
    FROM config_calendario cc WHERE cc.complejo_id = v_complejo;

  -- Sin configuración de calendario no hay ventana, y sin ventana no hay nada
  -- que se pueda reservar: contar agujeros ahí no significa nada.
  IF v_vhasta IS NOT NULL THEN
    v_desde := greatest(v_desde, v_vdesde);
    v_hasta := least(v_hasta, v_vhasta);

    IF v_desde <= v_hasta THEN
      SELECT count(*)::INTEGER INTO v_huecos
        FROM generate_series(v_desde, v_hasta, INTERVAL '1 day') AS g(d)
       WHERE NOT EXISTS (
         SELECT 1 FROM periodos_precio o
          WHERE o.complejo_id = v_complejo
            AND g.d::DATE BETWEEN o.desde AND o.hasta
       );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'noches_que_quedaron_sin_precio', v_huecos
  );
END;
$$;

-- ============================================
-- Qué no se puede cotizar
-- ============================================
-- Recorre la ventana de reservas —de hoy (o de `primera_fecha`, si todavía no
-- llegó) hasta `ultima_fecha`— y contesta tres preguntas que hoy no tienen
-- respuesta en ninguna pantalla:
--
--   1. ¿Hay noches sin ningún período? Nadie puede reservar esas noches.
--   2. ¿Hay unidades sin precio en un período que cae en la ventana? Esa unidad
--      está invendible en ese tramo.
--   3. ¿La ventana ya venció? `ultima_fecha` es una fecha que se pasa sola. El
--      día que pasa, el calendario deja de ofrecer todo y nada avisa.
--
-- La tercera es la que va a pasarle a todos los clientes tarde o temprano, y es
-- la más silenciosa de las tres: el sistema sigue respondiendo, la página
-- carga, y simplemente no se puede reservar nada.
CREATE OR REPLACE FUNCTION public.salud_de_los_precios(p_complejo UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_hoy      DATE;
  v_desde    DATE;
  v_hasta    DATE;
  v_primera  DATE;
  v_unidades INTEGER;
  v_sin_per  INTEGER := 0;
  v_primer   DATE;
  v_sin_pre  JSONB := '[]'::JSONB;
  v_vencida  BOOLEAN := false;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- El día de hoy en la zona del complejo, no en UTC. A las 21 de Argentina en
  -- UTC ya es mañana, y una ventana que vence hoy se vería vencida medio día
  -- antes de estarlo.
  SELECT (now() AT TIME ZONE c.zona_horaria)::DATE INTO v_hoy
    FROM complejos c WHERE c.id = p_complejo;

  SELECT cc.primera_fecha, cc.ultima_fecha INTO v_primera, v_hasta
    FROM config_calendario cc WHERE cc.complejo_id = p_complejo;

  -- Sólo las activas: una unidad fuera de circulación no se publica ni se
  -- puede reservar, así que no tener precio no le hace nada. Ver el encabezado.
  SELECT count(*)::INTEGER INTO v_unidades
    FROM unidades WHERE complejo_id = p_complejo AND activa;

  IF v_hasta IS NULL THEN
    -- Sin configuración de calendario la página no sabe hasta cuándo se puede
    -- reservar, y no inventa una regla: no ofrece nada.
    RETURN jsonb_build_object(
      'ok', false,
      'esta_bien', false,
      'sin_config', true,
      'unidades', v_unidades,
      'mensaje', 'Todavía no cargaste hasta cuándo se puede reservar, así que la página no ofrece ninguna fecha.'
    );
  END IF;

  v_desde := greatest(v_hoy, coalesce(v_primera, v_hoy));
  v_vencida := v_hasta < v_hoy;

  IF NOT v_vencida THEN
    SELECT count(*)::INTEGER, min(g.d::DATE) INTO v_sin_per, v_primer
      FROM generate_series(v_desde, v_hasta, INTERVAL '1 day') AS g(d)
     WHERE NOT EXISTS (
       SELECT 1 FROM periodos_precio p
        WHERE p.complejo_id = p_complejo
          AND g.d::DATE BETWEEN p.desde AND p.hasta
     );

    -- Una unidad por fila, con cuántas noches de la ventana le faltan y desde
    -- cuándo. Las noches se cuentan sólo del pedazo del período que cae adentro
    -- de la ventana: un período que arrancó en 2024 no suma noches de 2024.
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'nombre'), '[]'::JSONB) INTO v_sin_pre
      FROM (
        SELECT jsonb_build_object(
                 'unidad_id', u.id,
                 'codigo',    u.codigo,
                 'nombre',    u.nombre,
                 'noches',    sum(least(p.hasta, v_hasta) - greatest(p.desde, v_desde) + 1),
                 'desde',     min(greatest(p.desde, v_desde)),
                 'periodos',  count(*)
               ) AS x
          FROM unidades u
          JOIN periodos_precio p ON p.complejo_id = p_complejo
         WHERE u.complejo_id = p_complejo
           AND u.activa
           AND daterange(p.desde, p.hasta, '[]') && daterange(v_desde, v_hasta, '[]')
           AND NOT EXISTS (
             SELECT 1 FROM precios_unidad pu
              WHERE pu.periodo_id = p.id AND pu.unidad_id = u.id
           )
         GROUP BY u.id, u.codigo, u.nombre, u.orden
      ) AS t;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'esta_bien', v_unidades > 0
                 AND NOT v_vencida
                 AND v_sin_per = 0
                 AND jsonb_array_length(v_sin_pre) = 0,
    'sin_config', false,
    'unidades', v_unidades,
    'ventana_desde', v_desde,
    'ventana_hasta', v_hasta,
    'ventana_vencida', v_vencida,
    'dias_hasta_el_cierre', v_hasta - v_hoy,
    'noches_sin_periodo', v_sin_per,
    'primera_noche_sin_periodo', v_primer,
    'unidades_sin_precio', v_sin_pre
  );
END;
$$;

-- ============================================
-- Permisos
-- ============================================
-- Sólo `authenticated`: el huésped no entra por acá. Y `es_miembro()` adentro
-- de cada una decide cuál complejo, así que un usuario con sesión no alcanza.
REVOKE ALL ON FUNCTION public.periodos_del_complejo(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardar_periodo(UUID, DATE, DATE, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.borrar_periodo(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.salud_de_los_precios(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.periodos_del_complejo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_periodo(UUID, DATE, DATE, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_periodo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salud_de_los_precios(UUID) TO authenticated;
