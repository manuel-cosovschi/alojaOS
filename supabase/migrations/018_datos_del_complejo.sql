-- ============================================
-- Los datos del complejo y sus unidades
-- ============================================
-- Esto arregla una mentira que ya está viva.
--
-- Cuando un complejo no tiene `datos_transferencia`, el panel avisa: «No
-- cargaste dónde transferir. El huésped que reserve va a ver la seña y no el
-- alias ni el CBU. **Se carga en los datos del complejo.**»
--
-- Esa pantalla no existe. El panel le dice al dueño que vaya a un lugar al que
-- no puede ir, y el aviso queda ahí para siempre por más que lo lea. Es
-- exactamente la clase de respuesta que este sistema existe para no dar, y la
-- puse yo.
--
-- Y el dato en cuestión es el que cuesta plata: sin él, el huésped reserva, ve
-- cuánto tiene que señar y no sabe a dónde mandarlo.
--
-- ------------------------------------------------------------------
-- Lo que NO se puede cambiar, y por qué
-- ------------------------------------------------------------------
-- **El slug.** Lo prohíbe un trigger desde la 007. El dueño manda el link de su
-- página por WhatsApp a cada huésped; si el slug cambiara, todos esos links
-- dejarían de funcionar y los huéspedes con una reserva en curso no podrían ver
-- en qué quedó. Así que la pantalla no ofrece el campo y la función no lo toca.
--
-- **La marca** (los cuatro colores y las dos tipografías). Se cambia una vez,
-- cuando se da de alta el complejo, y equivocarse ahí deja la página fea sin
-- que el dueño sepa deshacerlo. Va a tener su propia pantalla, con vista
-- previa, o la sigo cargando yo. No la meto acá para no dar un campo de color
-- sin forma de ver el resultado.
--
-- ------------------------------------------------------------------
-- Borrar una unidad
-- ------------------------------------------------------------------
-- `reservas.unidad_id` es `ON DELETE RESTRICT` desde la 002, así que una unidad
-- con reservas **no se puede borrar**: Postgres se niega. Eso está bien y no lo
-- toco, porque borrarla destruiría el historial de plata que entró.
--
-- Lo que hace la función es dejar que la clave foránea decida y traducir el
-- `foreign_key_violation` a la frase que el dueño necesita: «esta unidad tiene
-- reservas, sacala de circulación». Que es lo que `activa` hace, y es lo que
-- casi siempre quiso decir el que apretó borrar.

-- ============================================
-- Los datos del complejo
-- ============================================
-- Un UPDATE con todos los campos, no uno por campo: el dueño abre la pantalla,
-- corrige dos cosas y guarda. Una función por campo multiplicaría las llamadas
-- y dejaría la pantalla a medio guardar si una falla.
--
-- Devuelve si quedó algo sin cargar que cueste plata —`datos_transferencia` y
-- `whatsapp`—, porque el aviso del panel sale de ahí y tiene que apagarse en el
-- acto cuando el dueño lo arregla.
CREATE OR REPLACE FUNCTION public.guardar_datos_del_complejo(
  p_complejo    UUID,
  p_nombre      TEXT,
  p_whatsapp    TEXT DEFAULT NULL,
  p_transferir  TEXT DEFAULT NULL,
  p_localidad   TEXT DEFAULT NULL,
  p_email       TEXT DEFAULT NULL,
  p_porcentaje  NUMERIC DEFAULT NULL,
  p_horas       SMALLINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wa TEXT;
  v_fila complejos%ROWTYPE;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF nullif(btrim(coalesce(p_nombre, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'falta_nombre',
      'mensaje', 'El complejo necesita un nombre: es lo que ve el huésped.');
  END IF;

  -- El número de WhatsApp va sin `+`, sin espacios y sin guiones, porque la
  -- página arma con él un enlace `wa.me/<numero>` y wa.me no acepta nada más.
  -- Se limpia acá en vez de rechazarlo: el dueño lo copia y pega del teléfono,
  -- donde viene con espacios, y hacerle borrar los espacios a mano sería
  -- pedirle que haga el trabajo de una expresión regular.
  v_wa := nullif(regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g'), '');

  IF v_wa IS NOT NULL AND length(v_wa) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'whatsapp_corto',
      'mensaje', format('«%s» no parece un número de WhatsApp. Va con código de país y de área, todo junto: 5492235550000.', p_whatsapp));
  END IF;

  IF p_porcentaje IS NOT NULL AND (p_porcentaje <= 0 OR p_porcentaje > 100) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'porcentaje_invalido',
      'mensaje', 'La seña tiene que ser más que 0% y hasta 100%.');
  END IF;

  IF p_horas IS NOT NULL AND (p_horas < 1 OR p_horas > 168) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'horas_invalidas',
      'mensaje', 'El plazo para transferir tiene que estar entre 1 hora y una semana.');
  END IF;

  -- `coalesce(p_x, x)` en los opcionales: así una llamada que no manda un campo
  -- lo deja como estaba en vez de borrarlo. Para vaciar uno a propósito se
  -- manda la cadena vacía, que `nullif` convierte en NULL.
  UPDATE complejos SET
    nombre     = btrim(p_nombre),
    whatsapp   = CASE WHEN p_whatsapp IS NULL THEN whatsapp ELSE v_wa END,
    datos_transferencia = CASE WHEN p_transferir IS NULL THEN datos_transferencia
                               ELSE nullif(btrim(p_transferir), '') END,
    localidad  = CASE WHEN p_localidad IS NULL THEN localidad
                      ELSE nullif(btrim(p_localidad), '') END,
    email      = CASE WHEN p_email IS NULL THEN email
                      ELSE nullif(btrim(p_email), '') END,
    porcentaje_sena        = coalesce(p_porcentaje, porcentaje_sena),
    horas_vencimiento_sena = coalesce(p_horas, horas_vencimiento_sena)
  WHERE id = p_complejo
  RETURNING * INTO v_fila;

  RETURN jsonb_build_object(
    'ok', true,
    'whatsapp', v_fila.whatsapp,
    -- Los dos que cuestan plata si faltan. El panel apaga su aviso con esto.
    'falta_donde_transferir', v_fila.datos_transferencia IS NULL,
    'falta_whatsapp', v_fila.whatsapp IS NULL
  );
END;
$$;

-- ============================================
-- Prender y apagar el alta pública
-- ============================================
-- Es una función aparte y no un campo del formulario de arriba porque es la
-- única cosa de esa pantalla que cambia lo que puede hacer un desconocido en
-- este momento. Apretarla sin querer mientras se corrige un teléfono sería
-- dejar de vender sin saberlo.
--
-- Prenderla con la casa a medio cargar es peor que no prenderla, así que
-- devuelve qué falta: sin precios ni ventana de reservas, la página queda
-- abierta y no deja reservar nada igual, y el dueño cree que está vendiendo.
CREATE OR REPLACE FUNCTION public.habilitar_reservas(
  p_complejo UUID,
  p_habilitar BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salud JSONB;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE complejos SET reservas_habilitadas = coalesce(p_habilitar, false)
   WHERE id = p_complejo;

  v_salud := public.salud_de_los_precios(p_complejo);

  RETURN jsonb_build_object(
    'ok', true,
    'habilitadas', coalesce(p_habilitar, false),
    -- Al prender, lo que importa es si de verdad se puede reservar algo. Al
    -- apagar no hace falta mirar nada: no se puede reservar y es a propósito.
    'pero_no_se_puede_reservar',
      coalesce(p_habilitar, false) AND (v_salud->>'esta_bien')::BOOLEAN IS NOT TRUE,
    'salud', v_salud
  );
END;
$$;

-- ============================================
-- Las unidades
-- ============================================
-- `p_unidad` NULL es un alta. El `codigo` sí se puede cambiar: a diferencia del
-- slug, no está en ningún link que el dueño haya mandado, y nada lo referencia
-- —los precios y las reservas cuelgan del `id`—. Lo único que lo limita es que
-- no se repita dentro del complejo, y eso lo decide la restricción UNIQUE.
CREATE OR REPLACE FUNCTION public.guardar_unidad(
  p_complejo   UUID,
  p_codigo     TEXT,
  p_nombre     TEXT,
  p_capacidad  SMALLINT,
  p_sugerencia TEXT DEFAULT NULL,
  p_orden      SMALLINT DEFAULT NULL,
  p_activa     BOOLEAN DEFAULT TRUE,
  p_unidad     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_codigo TEXT;
  v_orden  SMALLINT;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_codigo := upper(nullif(btrim(coalesce(p_codigo, '')), ''));

  IF v_codigo IS NULL OR nullif(btrim(coalesce(p_nombre, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'faltan_datos',
      'mensaje', 'La unidad necesita un código corto y un nombre.');
  END IF;

  IF p_capacidad IS NULL OR p_capacidad < 1 OR p_capacidad > 50 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'capacidad_invalida',
      'mensaje', 'La capacidad tiene que estar entre 1 y 50 personas.');
  END IF;

  -- Sin orden explícito va al final, que es lo que espera el que agrega una
  -- unidad nueva. Si todas quedaran en 0, el orden de la página dependería del
  -- orden físico de las filas, que cambia solo.
  v_orden := coalesce(p_orden, (
    SELECT coalesce(max(orden), 0) + 1 FROM unidades WHERE complejo_id = p_complejo
  ));

  BEGIN
    IF p_unidad IS NULL THEN
      INSERT INTO unidades (complejo_id, codigo, nombre, capacidad_maxima,
                            sugerencia_ocupacion, orden, activa)
      VALUES (p_complejo, v_codigo, btrim(p_nombre), p_capacidad,
              nullif(btrim(coalesce(p_sugerencia, '')), ''), v_orden,
              coalesce(p_activa, true))
      RETURNING id INTO v_id;
    ELSE
      -- El `complejo_id` en el WHERE no es redundante: sin él, el id de una
      -- unidad ajena pasaría la comprobación de `es_miembro` del complejo
      -- propio y editaría la unidad del vecino.
      UPDATE unidades SET
        codigo = v_codigo,
        nombre = btrim(p_nombre),
        capacidad_maxima = p_capacidad,
        sugerencia_ocupacion = nullif(btrim(coalesce(p_sugerencia, '')), ''),
        orden = v_orden,
        activa = coalesce(p_activa, activa)
       WHERE id = p_unidad AND complejo_id = p_complejo
      RETURNING id INTO v_id;

      IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe',
          'mensaje', 'Esa unidad ya no está.');
      END IF;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'codigo_repetido',
        'mensaje', format('Ya tenés una unidad con el código %s.', v_codigo));
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'era_alta', p_unidad IS NULL,
    'codigo', v_codigo,
    'orden', v_orden
  );
END;
$$;

-- ============================================
-- Borrar una unidad
-- ============================================
-- Deja que la clave foránea decida. `reservas.unidad_id` es ON DELETE RESTRICT,
-- así que una unidad con reservas no se borra —y no tiene que borrarse: eso
-- sería tirar el historial de la plata que entró—.
--
-- Mirar antes si tiene reservas y recién después borrar dejaría la ventana
-- donde entra una reserva en el medio. Y además devolvería la misma respuesta
-- con más código.
CREATE OR REPLACE FUNCTION public.borrar_unidad(p_unidad UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complejo UUID;
  v_nombre   TEXT;
BEGIN
  SELECT complejo_id, nombre INTO v_complejo, v_nombre
    FROM unidades WHERE id = p_unidad;

  IF v_complejo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe',
      'mensaje', 'Esa unidad ya no está.');
  END IF;

  IF NOT public.es_miembro(v_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  BEGIN
    DELETE FROM unidades WHERE id = p_unidad;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RETURN jsonb_build_object(
        'ok', false,
        'motivo', 'tiene_reservas',
        'mensaje', format('%s tiene reservas cargadas, así que no se borra: eso tiraría el historial. Sacala de circulación y deja de aparecer en tu página.', v_nombre)
      );
  END;

  RETURN jsonb_build_object('ok', true, 'nombre', v_nombre);
END;
$$;

-- ============================================
-- Permisos
-- ============================================
REVOKE ALL ON FUNCTION public.guardar_datos_del_complejo(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.habilitar_reservas(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guardar_unidad(UUID, TEXT, TEXT, SMALLINT, TEXT, SMALLINT, BOOLEAN, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.borrar_unidad(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.guardar_datos_del_complejo(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.habilitar_reservas(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_unidad(UUID, TEXT, TEXT, SMALLINT, TEXT, SMALLINT, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_unidad(UUID) TO authenticated;
