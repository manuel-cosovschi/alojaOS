-- ============================================
-- Dar de alta un complejo entero, de una
-- ============================================
-- Hoy el alta de un cliente la hago yo con INSERTs a mano: el complejo, sus
-- unidades, la configuración del calendario y la membresía del dueño. Son
-- cuatro escrituras en cuatro tablas, y si me equivoco en la tercera queda un
-- complejo a medio crear que nadie sabe que está a medias.
--
-- ------------------------------------------------------------------
-- Por qué una función y no un script con cuatro llamadas
-- ------------------------------------------------------------------
-- PostgREST no hace transacciones de varias peticiones. Un script que crea el
-- complejo, después las unidades y después el calendario puede fallar en el
-- medio y dejar un complejo sin unidades, o con unidades y sin ventana de
-- reservas —que es un complejo que existe, se puede abrir, y no vende nada—.
--
-- Acá es una sola llamada y una sola transacción: o queda todo, o no queda
-- nada. Es la misma razón por la que `crear_reserva()` es una función y no tres
-- escrituras desde el navegador.
--
-- ------------------------------------------------------------------
-- Quién la puede llamar
-- ------------------------------------------------------------------
-- Sólo `service_role`, o sea sólo el servidor con la clave de servicio. **No**
-- es una pantalla del panel: para eso haría falta un rol de administrador que
-- hoy no existe, y un rol que puede crear complejos es un rol que puede
-- escribir en el complejo de cualquiera. Esa es una superficie de permisos que
-- no se agrega al pasar para ahorrarme un comando.
--
-- Y es SECURITY INVOKER a propósito, al revés que casi todo lo demás de este
-- esquema: `service_role` ya saltea RLS por sí mismo, así que no hace falta que
-- la función eleve nada. Si algún día alguien le concediera EXECUTE a
-- `authenticated` por error, RLS le bloquearía las escrituras igual.
--
-- ------------------------------------------------------------------
-- Lo que NO prende
-- ------------------------------------------------------------------
-- `reservas_habilitadas` queda en `false`, que es el valor por omisión de la
-- tabla. Un complejo recién creado no tiene precios cargados, así que prenderlo
-- publicaría una página que se abre y no deja reservar nada. El que da el alta
-- lo prende después, cuando los precios están, y el panel le avisa si lo prende
-- antes.
CREATE OR REPLACE FUNCTION public.crear_complejo(p_datos JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id       UUID;
  v_slug     TEXT;
  v_duenio   UUID;
  v_unidad   JSONB;
  v_cuantas  INTEGER := 0;
  v_ultima   DATE;
BEGIN
  v_slug := lower(btrim(coalesce(p_datos->>'slug', '')));

  -- El slug tiene su CHECK en la tabla, pero el mensaje de Postgres no dice qué
  -- forma espera. Y es el dato que no se puede corregir después: un trigger lo
  -- vuelve inmutable en cuanto el complejo existe, porque es el link que el
  -- dueño les manda a sus huéspedes.
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(v_slug) NOT BETWEEN 3 AND 40 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'slug_invalido',
      'mensaje', 'La dirección va en minúsculas, sin acentos ni espacios, con guiones: «cabanias-del-sol». Entre 3 y 40 caracteres. Y no se puede cambiar después.');
  END IF;

  IF nullif(btrim(coalesce(p_datos->>'nombre', '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'falta_nombre',
      'mensaje', 'Falta el nombre del complejo.');
  END IF;

  BEGIN
    v_duenio := (p_datos->>'duenio')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_duenio := NULL;
  END;

  IF v_duenio IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'falta_duenio',
      'mensaje', 'Falta el id del usuario dueño. Se crea antes, por la API de Auth: una fila puesta a mano en auth.users existe para la base y no para el login.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_duenio) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'duenio_inexistente',
      'mensaje', 'Ese usuario no existe. Creálo primero por la API de Auth.');
  END IF;

  -- Sin unidades el complejo no vende nada, y crear uno vacío sería crear algo
  -- que hay que terminar en otro momento y que nadie recuerda que está a
  -- medias. El alta es el alta: entra completo.
  IF jsonb_typeof(p_datos->'unidades') <> 'array'
     OR jsonb_array_length(p_datos->'unidades') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_unidades',
      'mensaje', 'Hace falta al menos una unidad: un complejo sin unidades no puede vender nada.');
  END IF;

  -- `ultima_fecha` es NOT NULL en la tabla y es la fecha que hace que la página
  -- ofrezca algo. Un alta sin ella crea un complejo cuyo calendario sale vacío,
  -- así que se pide acá en vez de dejar que explote el NOT NULL.
  BEGIN
    v_ultima := (p_datos->>'ultima_fecha')::DATE;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    v_ultima := NULL;
  END;

  IF v_ultima IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'falta_ultima_fecha',
      'mensaje', 'Falta hasta cuándo se puede reservar (ultima_fecha, en AAAA-MM-DD). Sin eso el calendario de la página sale vacío.');
  END IF;

  BEGIN
    INSERT INTO complejos (
      slug, nombre, localidad, provincia, whatsapp, email,
      datos_transferencia, moneda, zona_horaria, mes_inicio_temporada,
      porcentaje_sena, horas_vencimiento_sena
    ) VALUES (
      v_slug,
      btrim(p_datos->>'nombre'),
      nullif(btrim(coalesce(p_datos->>'localidad', '')), ''),
      nullif(btrim(coalesce(p_datos->>'provincia', '')), ''),
      -- El mismo criterio que `guardar_datos_del_complejo()`: se limpia en vez
      -- de rechazarse, porque viene copiado de un teléfono.
      nullif(regexp_replace(coalesce(p_datos->>'whatsapp', ''), '[^0-9]', '', 'g'), ''),
      nullif(btrim(coalesce(p_datos->>'email', '')), ''),
      nullif(btrim(coalesce(p_datos->>'datos_transferencia', '')), ''),
      coalesce(nullif(btrim(coalesce(p_datos->>'moneda', '')), ''), 'ARS'),
      coalesce(nullif(btrim(coalesce(p_datos->>'zona_horaria', '')), ''),
               'America/Argentina/Buenos_Aires'),
      coalesce((p_datos->>'mes_inicio_temporada')::SMALLINT, 12),
      coalesce((p_datos->>'porcentaje_sena')::NUMERIC, 50),
      coalesce((p_datos->>'horas_vencimiento_sena')::SMALLINT, 6)
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Se deja decidir a la restricción en vez de mirar antes: dos altas
      -- simultáneas con el mismo slug pasarían las dos comprobaciones previas.
      RETURN jsonb_build_object('ok', false, 'motivo', 'slug_ocupado',
        'mensaje', format('Ya hay un complejo en «%s». Elegí otra dirección.', v_slug));
  END;

  INSERT INTO complejo_miembros (complejo_id, user_id, rol)
  VALUES (v_id, v_duenio, 'dueño');

  FOR v_unidad IN SELECT * FROM jsonb_array_elements(p_datos->'unidades')
  LOOP
    v_cuantas := v_cuantas + 1;

    IF nullif(btrim(coalesce(v_unidad->>'codigo', '')), '') IS NULL
       OR nullif(btrim(coalesce(v_unidad->>'nombre', '')), '') IS NULL THEN
      -- `RAISE` y no un `RETURN`: estamos en el medio de la transacción, con el
      -- complejo ya insertado. Levantar la revierte entera, que es exactamente
      -- lo que tiene que pasar.
      RAISE EXCEPTION 'La unidad %: le falta el código o el nombre.', v_cuantas
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO unidades (complejo_id, codigo, nombre, capacidad_maxima,
                          sugerencia_ocupacion, orden)
    VALUES (
      v_id,
      upper(btrim(v_unidad->>'codigo')),
      btrim(v_unidad->>'nombre'),
      (v_unidad->>'capacidad_maxima')::SMALLINT,
      nullif(btrim(coalesce(v_unidad->>'sugerencia_ocupacion', '')), ''),
      v_cuantas::SMALLINT
    );
  END LOOP;

  INSERT INTO config_calendario (complejo_id, primera_fecha, ultima_fecha, minimo_noches)
  VALUES (
    v_id,
    nullif(btrim(coalesce(p_datos->>'primera_fecha', '')), '')::DATE,
    v_ultima,
    coalesce((p_datos->>'minimo_noches')::SMALLINT, 1)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'slug', v_slug,
    'unidades', v_cuantas,
    -- Lo que el complejo todavía NO puede hacer, dicho en el acto. Un alta que
    -- contesta «listo» y deja un complejo que no vende nada es la misma falla
    -- que este sistema persigue en todas las otras pantallas.
    'falta', jsonb_build_object(
      'precios', true,
      'donde_transferir', nullif(btrim(coalesce(p_datos->>'datos_transferencia', '')), '') IS NULL,
      'whatsapp', nullif(regexp_replace(coalesce(p_datos->>'whatsapp', ''), '[^0-9]', '', 'g'), '') IS NULL
    ),
    'mensaje', 'Creado, pero todavía no vende: no tiene precios cargados y las reservas están apagadas.'
  );
END;
$$;

-- ============================================
-- Permisos
-- ============================================
-- Sólo `service_role`. Ni el dueño de un complejo puede crear otro: para eso
-- haría falta un rol de administrador, y un rol que crea complejos es un rol
-- que puede escribir en el de cualquiera.
REVOKE ALL ON FUNCTION public.crear_complejo(JSONB) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.crear_complejo(JSONB) FROM anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.crear_complejo(JSONB) TO service_role;
  END IF;
END $$;
