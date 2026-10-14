-- ============================================
-- Que el dueño maneje las reglas de su temporada
-- ============================================
-- La parte 2 de la 016. Allá quedó que el dueño pueda poner precios; acá, que
-- pueda decir hasta cuándo se vende, cuántas noches como mínimo, y qué bloques
-- van enteros.
--
-- ------------------------------------------------------------------
-- La bomba de tiempo que esto desarma
-- ------------------------------------------------------------------
-- `config_calendario.ultima_fecha` es la última noche reservable, y es NOT
-- NULL a propósito: sin ella la página no sabe qué contestarle a quien pide
-- enero del año que viene, y se planta antes que inventar una regla.
--
-- El problema es que es una fecha **que se pasa sola**. El día que pasa, el
-- calendario deja de ofrecer absolutamente todo: el sistema sigue andando, la
-- página carga, y no se puede reservar nada. Le va a pasar a cada cliente todos
-- los años, y hasta hoy la única forma de arreglarlo era que me escribiera.
--
-- `salud_de_los_precios()` ya lo detecta desde la 016. Esto es la otra mitad:
-- que el que lo ve pueda arreglarlo.
--
-- ------------------------------------------------------------------
-- La ex-constante
-- ------------------------------------------------------------------
-- En la página de Las Cañas la temporada alta estaba ESCRITA EN EL CÓDIGO: una
-- constante con 20/12 al 1/3, siete noches mínimo y check-in sólo sábado o
-- domingo. La 004 la convirtió en filas de `minimos_noches`. Esto es lo que
-- faltaba para cerrar el círculo: que el dueño cargue la suya sin que nadie
-- toque un archivo.
--
-- ------------------------------------------------------------------
-- Tres tablas, el mismo patrón
-- ------------------------------------------------------------------
-- `minimos_noches` y `bloques_fijos` tienen cada una su restricción de
-- exclusión contra el solape, por el mismo motivo: dos tramos que se pisan son
-- dos reglas contradictorias sobre la misma noche, y la página no tendría forma
-- de elegir cuál aplicar. Así que las dos funciones de guardado dejan que la
-- restricción decida y, cuando choca, dicen con qué.
--
-- Igual que en la 016, son SECURITY DEFINER y por lo tanto RLS no corre
-- adentro: el `es_miembro()` del principio es lo único que separa un complejo
-- de otro, y está probado desde los dos lados.

-- ============================================
-- La ventana de reservas y el mínimo general
-- ============================================
-- Un upsert, porque `config_calendario` tiene una fila por complejo y el dueño
-- no distingue «crear» de «cambiar»: para él es «hasta cuándo vendo».
--
-- Devuelve cuántas noches de la ventana nueva quedan sin precio. Eso conecta
-- las dos pantallas en el momento en que importa: el que estira la ventana
-- hasta marzo descubre ahí mismo que marzo no tiene precios cargados, en vez de
-- cuando un huésped no pueda reservar. Es el mismo número que da
-- `salud_de_los_precios()`, dicho en el momento de la acción que lo produjo.
CREATE OR REPLACE FUNCTION public.guardar_config_calendario(
  p_complejo UUID,
  p_ultima   DATE,
  p_minimo   SMALLINT DEFAULT 1,
  p_primera  DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoy    DATE;
  v_desde  DATE;
  v_huecos INTEGER := 0;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ultima IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'falta_ultima_fecha',
      'mensaje', 'Hace falta decir hasta cuándo se puede reservar. Sin eso la página no ofrece ninguna fecha.');
  END IF;

  IF p_primera IS NOT NULL AND p_primera > p_ultima THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fechas_invalidas',
      'mensaje', 'La primera fecha no puede ser posterior a la última.');
  END IF;

  IF p_minimo IS NULL OR p_minimo < 1 OR p_minimo > 30 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'minimo_invalido',
      'mensaje', 'El mínimo de noches tiene que estar entre 1 y 30.');
  END IF;

  SELECT (now() AT TIME ZONE c.zona_horaria)::DATE INTO v_hoy
    FROM complejos c WHERE c.id = p_complejo;

  -- Una `ultima_fecha` ya pasada se guarda igual, no se rechaza. Puede ser un
  -- paso intermedio mientras el dueño corrige, y negárselo lo dejaría sin poder
  -- escribir nada. Lo que no pasa es en silencio: la respuesta lo dice y
  -- `salud_de_los_precios()` lo pone en rojo en la pantalla.
  INSERT INTO config_calendario (complejo_id, primera_fecha, ultima_fecha, minimo_noches)
  VALUES (p_complejo, p_primera, p_ultima, p_minimo)
  ON CONFLICT (complejo_id) DO UPDATE
    SET primera_fecha = EXCLUDED.primera_fecha,
        ultima_fecha  = EXCLUDED.ultima_fecha,
        minimo_noches = EXCLUDED.minimo_noches;

  v_desde := greatest(v_hoy, coalesce(p_primera, v_hoy));

  IF v_desde <= p_ultima THEN
    SELECT count(*)::INTEGER INTO v_huecos
      FROM generate_series(v_desde, p_ultima, INTERVAL '1 day') AS g(d)
     WHERE NOT EXISTS (
       SELECT 1 FROM periodos_precio p
        WHERE p.complejo_id = p_complejo
          AND g.d::DATE BETWEEN p.desde AND p.hasta
     );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ventana_vencida', p_ultima < v_hoy,
    'dias_hasta_el_cierre', p_ultima - v_hoy,
    'noches_sin_precio', v_huecos
  );
END;
$$;

-- ============================================
-- Los mínimos por tramo
-- ============================================
-- «En enero, siete noches, y se entra sábado o domingo.» Pisa al mínimo general
-- mientras dura.
--
-- `p_dias_checkin` NULL es «cualquier día», que es distinto de un arreglo
-- vacío: un arreglo vacío sería «ningún día», o sea un tramo invendible. La
-- restricción de la tabla exige entre 1 y 7 días, así que el arreglo vacío se
-- convierte en NULL acá en vez de hacer fallar el CHECK con un mensaje que no
-- le dice nada al dueño.
CREATE OR REPLACE FUNCTION public.guardar_minimo(
  p_complejo UUID,
  p_desde    DATE,
  p_hasta    DATE,
  p_noches   SMALLINT,
  p_dias     SMALLINT[] DEFAULT NULL,
  p_etiqueta TEXT DEFAULT NULL,
  p_minimo   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_dias   SMALLINT[];
  v_choque RECORD;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fechas_invalidas',
      'mensaje', 'La fecha de fin no puede ser anterior a la de inicio.');
  END IF;

  IF p_noches IS NULL OR p_noches < 1 OR p_noches > 30 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'noches_invalidas',
      'mensaje', 'El mínimo de noches tiene que estar entre 1 y 30.');
  END IF;

  -- Vacío y «todos los días» son lo mismo para la página, y los dos se guardan
  -- como NULL. Siete días elegidos también: guardarlos como arreglo haría que
  -- la página mostrara «se puede entrar domingo, lunes, martes…» en vez de no
  -- decir nada, que es lo correcto cuando no hay restricción.
  v_dias := (SELECT array_agg(DISTINCT d ORDER BY d)
               FROM unnest(coalesce(p_dias, ARRAY[]::SMALLINT[])) AS d
              WHERE d BETWEEN 0 AND 6);

  IF v_dias IS NULL OR array_length(v_dias, 1) = 7 THEN
    v_dias := NULL;
  END IF;

  BEGIN
    IF p_minimo IS NULL THEN
      INSERT INTO minimos_noches (complejo_id, desde, hasta, noches, etiqueta, dias_checkin)
      VALUES (p_complejo, p_desde, p_hasta, p_noches,
              nullif(btrim(coalesce(p_etiqueta, '')), ''), v_dias)
      RETURNING id INTO v_id;
    ELSE
      -- El `complejo_id` en el WHERE no es redundante: sin él, el id de un
      -- tramo ajeno pasaría la comprobación de `es_miembro` del complejo propio.
      UPDATE minimos_noches
         SET desde = p_desde, hasta = p_hasta, noches = p_noches,
             etiqueta = nullif(btrim(coalesce(p_etiqueta, '')), ''),
             dias_checkin = v_dias
       WHERE id = p_minimo AND complejo_id = p_complejo
      RETURNING id INTO v_id;

      IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe',
          'mensaje', 'Ese tramo ya no está.');
      END IF;
    END IF;
  EXCEPTION
    WHEN exclusion_violation THEN
      SELECT o.desde, o.hasta, o.etiqueta, o.noches INTO v_choque
        FROM minimos_noches o
       WHERE o.complejo_id = p_complejo
         AND (p_minimo IS NULL OR o.id <> p_minimo)
         AND daterange(o.desde, o.hasta, '[]') && daterange(p_desde, p_hasta, '[]')
       ORDER BY o.desde
       LIMIT 1;

      RETURN jsonb_build_object(
        'ok', false,
        'motivo', 'se_pisa',
        'mensaje', 'Ese tramo se pisa con otro mínimo que ya tenés cargado.',
        'choca_con', jsonb_build_object(
          'desde', v_choque.desde, 'hasta', v_choque.hasta,
          'etiqueta', v_choque.etiqueta, 'noches', v_choque.noches
        )
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'era_alta', p_minimo IS NULL,
    'dias_checkin', v_dias,
    'cualquier_dia', v_dias IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.borrar_minimo(p_minimo UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complejo UUID;
  v_general  SMALLINT;
BEGIN
  SELECT complejo_id INTO v_complejo FROM minimos_noches WHERE id = p_minimo;

  IF v_complejo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe',
      'mensaje', 'Ese tramo ya no está.');
  END IF;

  IF NOT public.es_miembro(v_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM minimos_noches WHERE id = p_minimo;

  -- Sacar un tramo no deja esas noches sin regla: vuelven al mínimo general.
  -- Decir a cuál vuelven evita que el dueño borre el tramo de enero pensando
  -- que queda sin mínimo y se encuentre con que ahora se puede reservar una
  -- sola noche en temporada.
  SELECT minimo_noches INTO v_general
    FROM config_calendario WHERE complejo_id = v_complejo;

  RETURN jsonb_build_object(
    'ok', true,
    'vuelven_al_minimo_general', v_general
  );
END;
$$;

-- ============================================
-- Los bloques que van enteros
-- ============================================
-- El fin de semana largo que se alquila completo: o se toma de viernes a lunes,
-- o no se toma. Si se pudiera partir, el dueño queda con la noche del domingo
-- suelta, que no le va a alquilar a nadie.
--
-- Acá `check_out` es EXCLUSIVO —el día de salida, como en las reservas— al
-- revés de `minimos_noches` y `periodos_precio`, donde `hasta` es la última
-- noche. No es un descuido: un bloque fijo se compara contra una estadía, y una
-- estadía tiene día de salida. Los dos formularios lo dicen, porque es la clase
-- de diferencia que se olvida una vez por temporada.
CREATE OR REPLACE FUNCTION public.guardar_bloque_fijo(
  p_complejo  UUID,
  p_check_in  DATE,
  p_check_out DATE,
  p_etiqueta  TEXT DEFAULT NULL,
  p_bloque    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_choque RECORD;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_in >= p_check_out THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fechas_invalidas',
      'mensaje', 'La fecha de salida tiene que ser posterior a la de entrada.');
  END IF;

  BEGIN
    IF p_bloque IS NULL THEN
      INSERT INTO bloques_fijos (complejo_id, check_in, check_out, etiqueta)
      VALUES (p_complejo, p_check_in, p_check_out,
              nullif(btrim(coalesce(p_etiqueta, '')), ''))
      RETURNING id INTO v_id;
    ELSE
      UPDATE bloques_fijos
         SET check_in = p_check_in, check_out = p_check_out,
             etiqueta = nullif(btrim(coalesce(p_etiqueta, '')), '')
       WHERE id = p_bloque AND complejo_id = p_complejo
      RETURNING id INTO v_id;

      IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe',
          'mensaje', 'Ese bloque ya no está.');
      END IF;
    END IF;
  EXCEPTION
    WHEN exclusion_violation THEN
      SELECT o.check_in, o.check_out, o.etiqueta INTO v_choque
        FROM bloques_fijos o
       WHERE o.complejo_id = p_complejo
         AND (p_bloque IS NULL OR o.id <> p_bloque)
         AND daterange(o.check_in, o.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
       ORDER BY o.check_in
       LIMIT 1;

      RETURN jsonb_build_object(
        'ok', false,
        'motivo', 'se_pisa',
        'mensaje', 'Ese bloque se pisa con otro que ya tenés cargado.',
        'choca_con', jsonb_build_object(
          'check_in', v_choque.check_in, 'check_out', v_choque.check_out,
          'etiqueta', v_choque.etiqueta
        )
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'era_alta', p_bloque IS NULL,
    'noches', p_check_out - p_check_in
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.borrar_bloque_fijo(p_bloque UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complejo UUID;
BEGIN
  SELECT complejo_id INTO v_complejo FROM bloques_fijos WHERE id = p_bloque;

  IF v_complejo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe',
      'mensaje', 'Ese bloque ya no está.');
  END IF;

  IF NOT public.es_miembro(v_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM bloques_fijos WHERE id = p_bloque;

  -- Un bloque que se saca deja esas noches vendibles de a una. Decirlo porque
  -- es justo lo contrario de lo que el bloque existía para evitar.
  RETURN jsonb_build_object(
    'ok', true,
    'mensaje', 'Esas noches vuelven a venderse de a una.'
  );
END;
$$;

-- ============================================
-- Leer las reglas
-- ============================================
-- Una sola función para las tres cosas, porque el dueño las mira juntas: son
-- «las reglas de mi temporada», no tres listas. Y porque tres llamadas serían
-- tres viajes a la base para una pantalla.
--
-- `config` puede venir NULL: un complejo recién creado todavía no la tiene, y
-- ese es exactamente el estado que la pantalla tiene que poder mostrar.
CREATE OR REPLACE FUNCTION public.reglas_del_calendario(p_complejo UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_hoy DATE;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT (now() AT TIME ZONE c.zona_horaria)::DATE INTO v_hoy
    FROM complejos c WHERE c.id = p_complejo;

  RETURN jsonb_build_object(
    'hoy', v_hoy,
    'config', (
      SELECT jsonb_build_object(
               'primera_fecha', cc.primera_fecha,
               'ultima_fecha',  cc.ultima_fecha,
               'minimo_noches', cc.minimo_noches
             )
        FROM config_calendario cc WHERE cc.complejo_id = p_complejo
    ),
    -- Los dos de abajo sólo de hoy en adelante: un tramo de la temporada
    -- pasada no es una regla, es historia, y llenaría la pantalla de cosas que
    -- ya no hacen nada. `hasta >= hoy` y no `desde >= hoy` para que el tramo en
    -- curso —el que importa— siga apareciendo.
    'minimos', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', m.id, 'desde', m.desde, 'hasta', m.hasta,
                 'noches', m.noches, 'etiqueta', m.etiqueta,
                 'dias_checkin', m.dias_checkin
               ) ORDER BY m.desde
             )
        FROM minimos_noches m
       WHERE m.complejo_id = p_complejo AND m.hasta >= v_hoy
    ), '[]'::JSONB),
    'bloques', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', b.id, 'check_in', b.check_in, 'check_out', b.check_out,
                 'noches', b.check_out - b.check_in, 'etiqueta', b.etiqueta
               ) ORDER BY b.check_in
             )
        FROM bloques_fijos b
       WHERE b.complejo_id = p_complejo AND b.check_out > v_hoy
    ), '[]'::JSONB)
  );
END;
$$;

-- ============================================
-- Permisos
-- ============================================
REVOKE ALL ON FUNCTION public.guardar_config_calendario(UUID, DATE, SMALLINT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardar_minimo(UUID, DATE, DATE, SMALLINT, SMALLINT[], TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.borrar_minimo(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardar_bloque_fijo(UUID, DATE, DATE, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.borrar_bloque_fijo(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reglas_del_calendario(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.guardar_config_calendario(UUID, DATE, SMALLINT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_minimo(UUID, DATE, DATE, SMALLINT, SMALLINT[], TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_minimo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_bloque_fijo(UUID, DATE, DATE, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_bloque_fijo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reglas_del_calendario(UUID) TO authenticated;
