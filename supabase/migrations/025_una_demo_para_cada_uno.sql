-- ============================================
-- Una demo para cada visitante
-- ============================================
-- Hasta acá el demo de AlojaOS era la página de reservas de un complejo
-- inventado, compartida: cualquiera podía reservar ahí, pero nadie podía ver el
-- panel, que es la mitad del producto y la que el dueño usa todos los días. El
-- panel sólo se mostraba en capturas.
--
-- Ahora cada visitante recibe una copia entera y propia de un complejo de
-- ejemplo, entra como su dueño, y una guía lo lleva por cada pantalla. Puede
-- confirmar señas, cerrar fechas, cambiar precios y colores, y reservar como
-- huésped en la página de SU copia para ver la reserva llegar al panel. Lo que
-- rompe es suyo: nadie más lo ve.
--
-- Es el mismo molde que la demo de GastroOS, adaptado a lo que tiene de propio
-- un sistema de reservas: las fechas. Ver «Las fechas no envejecen», abajo.
--
-- ------------------------------------------------------------------
-- Lo que esta migración garantiza, y dónde
-- ------------------------------------------------------------------
--   · La plantilla no se ve desde afuera: `complejo_publico` no la devuelve.
--     Una copia sí, por su subdominio: es la página que el visitante prueba.
--   · Una demo nunca le manda un mail a nadie. El mail del huésped lo escribe
--     el visitante, y un formulario que le manda un correo desde nuestro
--     dominio a la dirección que uno tipee es un formulario para mandar correo
--     a cualquiera. El aviso queda anotado como DEMO y el panel no lo reclama.
--   · Cada copia es de un solo usuario, y el aislamiento es el de siempre:
--     `es_miembro()`. No hay un camino nuevo de permisos: la copia es un
--     complejo más y su visitante, un dueño más.
--   · Crear demos tiene tope por IP, y las que nadie visita se borran solas
--     —el complejo, sus reservas y la cuenta— al armar la siguiente.
--   · Todo lo que crea o borra demos es de `service_role`. Nada de esto entra
--     en la superficie pública.

-- ============================================
-- La plantilla
-- ============================================
ALTER TABLE complejos ADD COLUMN IF NOT EXISTS es_plantilla_demo BOOLEAN NOT NULL DEFAULT false;

-- Una sola, o el molde deja de ser un molde. Un índice parcial sobre una
-- constante es la forma de decir «como mucho una fila cumple esto».
CREATE UNIQUE INDEX IF NOT EXISTS complejos_una_plantilla_demo
  ON complejos ((true)) WHERE es_plantilla_demo;

-- ============================================
-- Las copias
-- ============================================
CREATE TABLE IF NOT EXISTS demos (
  complejo_id UUID PRIMARY KEY REFERENCES complejos(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Para el tope por IP. La pone nuestro servidor, igual que en las reservas.
  origen_ip   TEXT,
  creada_el   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Se corre cada vez que el visitante vuelve: una demo en uso no se borra
  -- debajo de quien la está mirando.
  visto_el    TIMESTAMPTZ NOT NULL DEFAULT now(),
  vence_el    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS demos_vence_idx ON demos (vence_el);
CREATE INDEX IF NOT EXISTS demos_usuario_idx ON demos (user_id);
CREATE INDEX IF NOT EXISTS demos_ip_idx ON demos (origen_ip, creada_el DESC) WHERE origen_ip IS NOT NULL;

-- Sin policies a propósito, y además sin permisos: la tabla la tocan sólo las
-- funciones de abajo. Con RLS prendido y sin policies ya no se leía nada, pero
-- Supabase le da DML completo a `anon` y `authenticated` sobre todo lo que hay
-- en `public`, y esos permisos quedarían esperando a que alguien agregue una
-- policy para otra cosa.
ALTER TABLE demos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE demos FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.es_demo(p_complejo UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM demos WHERE complejo_id = p_complejo);
$$;

REVOKE ALL ON FUNCTION public.es_demo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.es_demo(UUID) TO service_role;

/**
 * La demo de quien está mirando el panel, o null.
 *
 * Es lo único de esto que llama una sesión de usuario: el panel lo pregunta
 * para saber si mostrar la guía y el cartel de demo. Contesta sólo por el
 * usuario de la sesión (`auth.uid()`), nunca por un id que se le pase.
 */
CREATE OR REPLACE FUNCTION public.mi_demo()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('complejo_id', d.complejo_id, 'slug', c.slug, 'vence_el', d.vence_el)
    FROM demos d JOIN complejos c ON c.id = d.complejo_id
   WHERE d.user_id = auth.uid()
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.mi_demo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_demo() TO authenticated, service_role;

-- ============================================
-- Los topes
-- ============================================
-- En un lugar, como los de las reservas, para que el arnés y el verificador
-- lean los mismos números que la función.
CREATE OR REPLACE FUNCTION public.limites_de_demo()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    -- Demos nuevas por IP y por hora. Una persona mirando entra una vez y,
    -- si reinicia, reusa la misma (ver `tirar_demo`). Ocho alcanza para una
    -- oficina con varias personas detrás de la misma IP.
    'por_ip', 8,
    -- Cuántas pueden vivir a la vez. Pasado eso se borran las más viejas:
    -- cada demo es un complejo con su calendario, y no hay razón para que la
    -- base crezca sin techo porque alguien encontró el botón.
    'vivas', 300,
    -- Cuánto vive una demo desde la última visita.
    'horas', 72
  );
$$;

REVOKE ALL ON FUNCTION public.limites_de_demo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limites_de_demo() TO service_role;

-- ============================================
-- Las fechas no envejecen
-- ============================================
-- Un sistema de reservas vive de fechas, y una plantilla sembrada una vez
-- envejece: a los meses, las señas de ejemplo quedan en el pasado y el
-- calendario de la copia arranca vacío, en la pantalla cuyo trabajo es
-- convencer a alguien que nunca vio el sistema. GastroOS lo sufrió.
--
-- La plantilla cubre un año exacto de temporadas (364 días, del 1/10 al
-- 29/9) y tiene sus señas en el verano. Cada copia:
--
--   · corre las RESERVAS la cantidad de días que haga falta para que la seña
--     de ejemplo más temprana caiga por lo menos una semana adelante;
--   · y copia las TEMPORADAS —precios, mínimos, bloques— dos veces seguidas,
--     la vuelta de las reservas y la anterior, salteando lo que ya pasó. Así
--     el calendario cubre desde hoy hasta el verano de las reservas, sin un
--     hueco en el medio.
--
-- Correr de a una cantidad (en vez de copiar dos veces) dejaba, a principios
-- de enero, una demo sin nada reservable hasta septiembre.
--
-- Y siempre de a 364 días, no 365: son 52 semanas justas, y la regla que más
-- importa de la plantilla es «en temporada alta se entra sábado o domingo».
-- Correr 365 dejaría los bloques de sábado a sábado empezando un domingo.
CREATE OR REPLACE FUNCTION public.dias_de_la_demo()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN s.primera IS NULL OR s.primera >= CURRENT_DATE + 7 THEN 0
           ELSE 364 * ceil(((CURRENT_DATE + 7) - s.primera)::numeric / 364)::int
         END
    FROM (
      SELECT min(r.check_in) AS primera
        FROM complejos c
        JOIN reservas r ON r.complejo_id = c.id AND r.estado = 'HOLD_TRANSFER'
       WHERE c.es_plantilla_demo
    ) s;
$$;

REVOKE ALL ON FUNCTION public.dias_de_la_demo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dias_de_la_demo() TO service_role;

-- ============================================
-- Armar una copia
-- ============================================
CREATE OR REPLACE FUNCTION public.crear_demo(p_user UUID, p_ip TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lim   JSONB := public.limites_de_demo();
  v_plant complejos%ROWTYPE;
  v_id    UUID := gen_random_uuid();
  v_slug  TEXT;
  v_dias  INTEGER;
  v_vuelta INTEGER;
  v_n     INTEGER;
BEGIN
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_usuario');
  END IF;

  SELECT * INTO v_plant FROM complejos WHERE es_plantilla_demo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_plantilla');
  END IF;

  -- Una por usuario. «Reiniciar» tira la vieja antes de pedir una nueva.
  IF EXISTS (SELECT 1 FROM demos WHERE user_id = p_user) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_tiene');
  END IF;

  IF p_ip IS NOT NULL THEN
    SELECT count(*) INTO v_n
      FROM demos
     WHERE origen_ip = p_ip AND creada_el > now() - INTERVAL '1 hour';
    IF v_n >= (v_lim->>'por_ip')::int THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'muchas_demos',
        'mensaje', 'Ya abriste varias demos desde acá en la última hora. Esperá un rato o escribinos y te la mostramos.');
    END IF;
  END IF;

  v_dias := public.dias_de_la_demo();
  -- Diez caracteres de un UUID nuevo: no se adivina y entra en un subdominio.
  v_slug := 'demo-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  INSERT INTO complejos (
    id, slug, nombre, nombre_corto, descripcion,
    localidad, provincia, pais, direccion, lat, lng,
    whatsapp, instagram, email,
    color_principal, color_fondo, color_texto, color_acento,
    tipografia_titulos, tipografia_cuerpo, logo_path,
    mes_inicio_temporada, moneda, zona_horaria,
    porcentaje_sena, horas_vencimiento_sena, reservas_habilitadas,
    datos_transferencia, es_plantilla_demo
  )
  SELECT v_id, v_slug, nombre, nombre_corto, descripcion,
         localidad, provincia, pais, direccion, lat, lng,
         whatsapp, instagram, email,
         color_principal, color_fondo, color_texto, color_acento,
         tipografia_titulos, tipografia_cuerpo, logo_path,
         mes_inicio_temporada, moneda, zona_horaria,
         porcentaje_sena, horas_vencimiento_sena, true,
         datos_transferencia, false
    FROM complejos WHERE id = v_plant.id;

  -- Las unidades se emparejan por código, que es único dentro de un complejo.
  INSERT INTO unidades (complejo_id, codigo, nombre, capacidad_maxima, sugerencia_ocupacion, orden, activa)
  SELECT v_id, codigo, nombre, capacidad_maxima, sugerencia_ocupacion, orden, activa
    FROM unidades WHERE complejo_id = v_plant.id;

  INSERT INTO config_calendario (complejo_id, primera_fecha, ultima_fecha, minimo_noches)
  SELECT v_id, NULL, ultima_fecha + v_dias, minimo_noches
    FROM config_calendario WHERE complejo_id = v_plant.id;

  -- Las temporadas, dos vueltas: la de las reservas y la anterior. Lo que
  -- termina antes de hoy no se copia. Ver «Las fechas no envejecen».
  FOREACH v_vuelta IN ARRAY ARRAY[v_dias - 364, v_dias] LOOP
    INSERT INTO minimos_noches (complejo_id, desde, hasta, noches, etiqueta, dias_checkin)
    SELECT v_id, desde + v_vuelta, hasta + v_vuelta, noches, etiqueta, dias_checkin
      FROM minimos_noches
     WHERE complejo_id = v_plant.id AND hasta + v_vuelta >= CURRENT_DATE;

    INSERT INTO bloques_fijos (complejo_id, check_in, check_out, etiqueta)
    SELECT v_id, check_in + v_vuelta, check_out + v_vuelta, etiqueta
      FROM bloques_fijos
     WHERE complejo_id = v_plant.id AND check_in + v_vuelta >= CURRENT_DATE;

    INSERT INTO objetivos_temporada (complejo_id, temporada, objetivo)
    SELECT v_id, temporada + (v_vuelta / 364), objetivo
      FROM objetivos_temporada
     WHERE complejo_id = v_plant.id AND temporada + (v_vuelta / 364) >= extract(year FROM CURRENT_DATE)::int - 1;

    -- Los períodos se emparejan por su primer día: no se pueden solapar, así
    -- que dentro de un complejo el `desde` es único.
    INSERT INTO periodos_precio (complejo_id, desde, hasta, etiqueta)
    SELECT v_id, desde + v_vuelta, hasta + v_vuelta, etiqueta
      FROM periodos_precio
     WHERE complejo_id = v_plant.id AND hasta + v_vuelta >= CURRENT_DATE;

    INSERT INTO precios_unidad (periodo_id, unidad_id, precio)
    SELECT pn.id, un.id, pu.precio
      FROM precios_unidad pu
      JOIN periodos_precio pv ON pv.id = pu.periodo_id AND pv.complejo_id = v_plant.id
      JOIN unidades uv        ON uv.id = pu.unidad_id
      JOIN periodos_precio pn ON pn.complejo_id = v_id AND pn.desde = pv.desde + v_vuelta
      JOIN unidades un        ON un.complejo_id = v_id AND un.codigo = uv.codigo;
  END LOOP;

  -- Las reservas de ejemplo. Los plazos se recalculan contra ahora: una seña
  -- copiada con el vencimiento de la plantilla estaría vencida de nacimiento.
  -- La que tiene comprobante vence antes, para que la lista se lea por orden
  -- de urgencia como la vería un dueño.
  INSERT INTO reservas (
    complejo_id, unidad_id, check_in, check_out, estado, origen,
    huesped_nombre, huesped_dni, huesped_email, huesped_telefono,
    personas, acompanantes, notas, importe, anticipo, medio_pago,
    vence_el, aprobada_el, motivo_estado,
    comprobante_path, comprobante_subido_el, created_at
  )
  SELECT v_id, un.id, r.check_in + v_dias, r.check_out + v_dias, r.estado, r.origen,
         r.huesped_nombre, r.huesped_dni, r.huesped_email, r.huesped_telefono,
         r.personas, r.acompanantes, r.notas, r.importe, r.anticipo, r.medio_pago,
         CASE WHEN r.estado = 'HOLD_TRANSFER' THEN
           now() + CASE WHEN r.comprobante_path IS NOT NULL
                        THEN INTERVAL '3 hours 20 minutes'
                        ELSE INTERVAL '5 hours 10 minutes' END
         END,
         CASE WHEN r.estado = 'CONFIRMED' THEN now() - INTERVAL '8 days' END,
         r.motivo_estado,
         r.comprobante_path,
         CASE WHEN r.comprobante_path IS NOT NULL THEN now() - INTERVAL '25 minutes' END,
         CASE r.estado WHEN 'HOLD_TRANSFER' THEN now() - INTERVAL '40 minutes'
                       ELSE now() - INTERVAL '9 days' END
    FROM reservas r
    JOIN unidades uv ON uv.id = r.unidad_id
    JOIN unidades un ON un.complejo_id = v_id AND un.codigo = uv.codigo
   WHERE r.complejo_id = v_plant.id
     AND r.estado IN ('HOLD_TRANSFER', 'CONFIRMED', 'BLOCKED');

  -- Los avisos de las reservas copiadas, anotados como DEMO: nunca se mandó
  -- un mail por ellas y nunca se va a mandar. Sin esta fila el panel diría
  -- «a este huésped no le llegó el mail» por cada reserva de ejemplo.
  INSERT INTO avisos (reserva_id, tipo, destino, estado)
  SELECT r.id,
         CASE r.estado WHEN 'HOLD_TRANSFER' THEN 'sena_pendiente' ELSE 'reserva_confirmada' END,
         r.huesped_email, 'DEMO'
    FROM reservas r
   WHERE r.complejo_id = v_id
     AND r.estado IN ('HOLD_TRANSFER', 'CONFIRMED')
     AND r.origen <> 'bloqueo';

  INSERT INTO complejo_miembros (complejo_id, user_id) VALUES (v_id, p_user);

  INSERT INTO demos (complejo_id, user_id, origen_ip, vence_el)
  VALUES (v_id, p_user, p_ip, now() + make_interval(hours => (v_lim->>'horas')::int));

  RETURN jsonb_build_object('ok', true, 'complejo_id', v_id, 'slug', v_slug, 'dias_corridos', v_dias);
END;
$$;

REVOKE ALL ON FUNCTION public.crear_demo(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_demo(UUID, TEXT) TO service_role;

/** El visitante volvió: su demo vive tres días más. Devuelve el complejo, o null. */
CREATE OR REPLACE FUNCTION public.tocar_demo(p_user UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE demos
     SET visto_el = now(),
         vence_el = greatest(vence_el, now() + make_interval(hours => (public.limites_de_demo()->>'horas')::int))
   WHERE user_id = p_user
  RETURNING complejo_id;
$$;

REVOKE ALL ON FUNCTION public.tocar_demo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tocar_demo(UUID) TO service_role;

/**
 * Tira las demos de un usuario y devuelve qué complejos borró.
 *
 * Devuelve los ids porque los comprobantes que el visitante subió como huésped
 * viven en el almacenamiento, bajo `<complejo_id>/`, y eso lo borra el
 * servidor: la base no llega hasta ahí.
 *
 * Las reservas se borran antes que el complejo, a mano. Llegarían solas por la
 * cascada, pero `reservas.unidad_id` es RESTRICT, que se comprueba en el
 * momento: si la cascada llega primero a las unidades, el borrado falla.
 */
CREATE OR REPLACE FUNCTION public.tirar_demo(p_user UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  SELECT coalesce(array_agg(complejo_id), '{}') INTO v_ids FROM demos WHERE user_id = p_user;
  DELETE FROM reservas  WHERE complejo_id = ANY (v_ids);
  DELETE FROM complejos WHERE id = ANY (v_ids);
  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.tirar_demo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tirar_demo(UUID) TO service_role;

/**
 * Borra las demos vencidas y las que pasan del techo, con sus cuentas.
 *
 * No hay cron: se llama al armar una demo nueva, que es justo cuando importa
 * que no estén.
 *
 * La cuenta se borra sólo si se cumplen las tres: era de una demo, ya no es
 * miembro de ningún complejo, y su mail es del dominio de las demos. La tercera
 * es la que importa: un error en las otras dos no puede llevarse la cuenta de
 * un dueño de verdad.
 */
CREATE OR REPLACE FUNCTION public.limpiar_demos()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_vivas    INTEGER := (public.limites_de_demo()->>'vivas')::int;
  v_ids      UUID[];
  v_usuarios UUID[];
  v_cuentas  INTEGER;
BEGIN
  SELECT coalesce(array_agg(complejo_id), '{}'), coalesce(array_agg(DISTINCT user_id), '{}')
    INTO v_ids, v_usuarios
    FROM (
      SELECT complejo_id, user_id FROM demos WHERE vence_el < now()
      UNION
      SELECT complejo_id, user_id FROM (
        SELECT complejo_id, user_id, row_number() OVER (ORDER BY visto_el DESC) AS n FROM demos
      ) t WHERE n > v_vivas
    ) s;

  DELETE FROM reservas  WHERE complejo_id = ANY (v_ids);
  DELETE FROM complejos WHERE id = ANY (v_ids);

  DELETE FROM auth.users u
   WHERE u.id = ANY (v_usuarios)
     AND u.email LIKE '%@demo.alojaos.shop'
     AND NOT EXISTS (SELECT 1 FROM public.complejo_miembros m WHERE m.user_id = u.id);
  GET DIAGNOSTICS v_cuentas = ROW_COUNT;

  RETURN jsonb_build_object('complejos', to_jsonb(v_ids), 'cuentas', v_cuentas);
END;
$$;

REVOKE ALL ON FUNCTION public.limpiar_demos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpiar_demos() TO service_role;

-- ============================================
-- Los avisos: DEMO es un estado
-- ============================================
ALTER TABLE avisos DROP CONSTRAINT IF EXISTS avisos_estado_check;
ALTER TABLE avisos ADD CONSTRAINT avisos_estado_check
  CHECK (estado IN ('ENVIADO', 'FALLO', 'SIN_CONFIGURAR', 'DEMO'));

-- Cuerpo tomado del que corre en producción; lo nuevo es el bloque DEMO.
CREATE OR REPLACE FUNCTION public.anotar_aviso(p_reserva uuid, p_tipo text, p_estado text, p_destino text DEFAULT NULL::text, p_error text DEFAULT NULL::text, p_externo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_estado NOT IN ('ENVIADO', 'FALLO', 'SIN_CONFIGURAR', 'DEMO') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'estado_desconocido', 'estado', p_estado);
  END IF;
  -- DEMO sólo vale para una reserva de una demo. Si no, sería la forma de que
  -- el aviso de un huésped de verdad quede tapado como «no hacía falta».
  IF p_estado = 'DEMO' AND NOT EXISTS (
       SELECT 1 FROM reservas r JOIN demos d ON d.complejo_id = r.complejo_id WHERE r.id = p_reserva) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_es_demo');
  END IF;
  -- Un FALLO sin motivo lo rechaza la restricción. Se le pone uno acá antes de
  -- llegar ahí: que la fila exista con el estado correcto importa más que el
  -- texto, y una excepción cortaría el aviso de una reserva que está bien.
  IF p_estado = 'FALLO' AND (p_error IS NULL OR length(trim(p_error)) = 0) THEN
    p_error := 'el proveedor falló sin decir por qué';
  END IF;
  INSERT INTO avisos (reserva_id, tipo, destino, estado, error, id_externo)
  VALUES (p_reserva, p_tipo, p_destino, p_estado, p_error, p_externo)
  ON CONFLICT (reserva_id, tipo) DO UPDATE
    SET estado     = EXCLUDED.estado,
        destino    = EXCLUDED.destino,
        error      = EXCLUDED.error,
        id_externo = EXCLUDED.id_externo,
        intentos   = avisos.intentos + 1
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- Cuerpo tomado del que corre en producción; lo nuevo es `es_demo`, que el
-- servidor mira antes de mandar nada.
CREATE OR REPLACE FUNCTION public.datos_del_aviso(p_reserva uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'reserva_id', r.id,
    'estado', r.estado,
    'huesped', r.huesped_nombre,
    'email', r.huesped_email,
    'unidad', u.nombre,
    'check_in', r.check_in,
    'check_out', r.check_out,
    'noches', (r.check_out - r.check_in),
    'total', r.importe,
    'sena', round(r.importe * c.porcentaje_sena / 100.0),
    'vence_el', r.vence_el,
    'complejo', c.nombre,
    'slug', c.slug,
    'moneda', c.moneda,
    'zona_horaria', c.zona_horaria,
    'datos_transferencia', c.datos_transferencia,
    'whatsapp', c.whatsapp,
    'mail_del_complejo', c.email,
    'es_demo', EXISTS (SELECT 1 FROM demos d WHERE d.complejo_id = c.id)
  )
    FROM reservas r
    JOIN unidades  u ON u.id = r.unidad_id
    JOIN complejos c ON c.id = r.complejo_id
   WHERE r.id = p_reserva;
$$;

-- Cuerpo tomado del que corre en producción; lo nuevo es que DEMO no se reclama.
CREATE OR REPLACE FUNCTION public.avisos_que_no_salieron(p_complejo uuid)
 RETURNS TABLE(reserva_id uuid, tipo text, estado text, error text, intentos smallint, huesped_nombre text, huesped_telefono text, huesped_email text, check_in date, cuando timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- LEFT JOIN desde `reservas` y no una consulta sobre `avisos`: una reserva
  -- SIN ninguna fila de aviso es una en la que el mail no se intentó nunca, y
  -- para el huésped «no se intentó» y «falló» son lo mismo.
  RETURN QUERY
    SELECT r.id,
           CASE r.estado WHEN 'HOLD_TRANSFER' THEN 'sena_pendiente'
                         ELSE 'reserva_confirmada' END::TEXT,
           coalesce(a.estado, 'NO_INTENTADO')::TEXT,
           a.error,
           coalesce(a.intentos, 0::SMALLINT),
           r.huesped_nombre, r.huesped_telefono, r.huesped_email,
           r.check_in,
           coalesce(a.updated_at, r.created_at)
      FROM reservas r
      LEFT JOIN avisos a
             ON a.reserva_id = r.id
            AND a.tipo = CASE r.estado WHEN 'HOLD_TRANSFER' THEN 'sena_pendiente'
                                       ELSE 'reserva_confirmada' END
     WHERE r.complejo_id = p_complejo
       AND r.estado IN ('HOLD_TRANSFER', 'CONFIRMED')
       AND r.origen <> 'bloqueo'
       -- En una demo no sale ningún mail, a propósito: no es algo que avisar.
       AND (a.id IS NULL OR a.estado NOT IN ('ENVIADO', 'DEMO'))
     ORDER BY r.created_at DESC;
END;
$$;

-- ============================================
-- La plantilla no se ve desde afuera
-- ============================================
-- Cuerpo tomado del que corre en producción; lo nuevo es el último renglón del
-- WHERE y la clave `es_demo`, con la que la página del huésped de una copia
-- muestra el cartel que lleva de vuelta al panel.
CREATE OR REPLACE FUNCTION public.complejo_publico(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'id',   c.id,
    'slug', c.slug,
    'nombre',       c.nombre,
    'nombre_corto', c.nombre_corto,
    'descripcion',  c.descripcion,
    'localidad', c.localidad,
    'provincia', c.provincia,
    'pais',      c.pais,
    'direccion', c.direccion,
    'lat', c.lat,
    'lng', c.lng,
    'whatsapp',  c.whatsapp,
    'instagram', c.instagram,
    'email',     c.email,
    'marca', jsonb_build_object(
      'color_principal', c.color_principal,
      'color_fondo',     c.color_fondo,
      'color_texto',     c.color_texto,
      'color_acento',    c.color_acento,
      'tipografia_titulos', c.tipografia_titulos,
      'tipografia_cuerpo',  c.tipografia_cuerpo,
      'logo_path', c.logo_path
    ),
    'moneda', c.moneda,
    'zona_horaria', c.zona_horaria,
    'porcentaje_sena', c.porcentaje_sena,
    'horas_vencimiento_sena', c.horas_vencimiento_sena,
    'reservas_habilitadas', c.reservas_habilitadas,
    'es_demo', EXISTS (SELECT 1 FROM demos d WHERE d.complejo_id = c.id),

    'unidades', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', u.id,
               'codigo', u.codigo,
               'nombre', u.nombre,
               'capacidad_maxima', u.capacidad_maxima,
               'sugerencia_ocupacion', u.sugerencia_ocupacion
             ) ORDER BY u.orden, u.codigo)
        FROM unidades u
       WHERE u.complejo_id = c.id AND u.activa
    ), '[]'::jsonb),

    'calendario', (
      SELECT jsonb_build_object(
               'primera_fecha', cc.primera_fecha,
               'ultima_fecha',  cc.ultima_fecha,
               'minimo_noches', cc.minimo_noches
             )
        FROM config_calendario cc WHERE cc.complejo_id = c.id
    ),

    'bloques_fijos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'check_in', b.check_in, 'check_out', b.check_out, 'etiqueta', b.etiqueta
             ) ORDER BY b.check_in)
        FROM bloques_fijos b WHERE b.complejo_id = c.id
    ), '[]'::jsonb),

    'minimos_noches', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'desde', m.desde, 'hasta', m.hasta, 'noches', m.noches,
               'etiqueta', m.etiqueta, 'dias_checkin', m.dias_checkin
             ) ORDER BY m.desde)
        FROM minimos_noches m WHERE m.complejo_id = c.id
    ), '[]'::jsonb),

    'periodos_precio', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'desde', p.desde,
               'hasta', p.hasta,
               'etiqueta', p.etiqueta,
               'precios', coalesce((
                 SELECT jsonb_object_agg(u2.codigo, pu.precio)
                   FROM precios_unidad pu
                   JOIN unidades u2 ON u2.id = pu.unidad_id
                  WHERE pu.periodo_id = p.id AND u2.activa
               ), '{}'::jsonb)
             ) ORDER BY p.desde)
        FROM periodos_precio p WHERE p.complejo_id = c.id
    ), '[]'::jsonb)
  )
  FROM complejos c
  WHERE c.slug = lower(p_slug)
    AND NOT c.es_plantilla_demo;
$$;

-- ============================================
-- La plantilla, sembrada
-- ============================================
-- Inventada, como el complejo del demo público, y con los casos que la guía
-- muestra: una seña con comprobante esperando que el dueño la mire, una sin
-- comprobante, una reserva confirmada, unos días que el dueño cerró para él,
-- dos temporadas con precio, un mínimo de siete noches entrando sábado o
-- domingo, y una cabaña sin precio en temporada alta para que se vea el aviso.
--
-- Los teléfonos y mails son del dominio reservado `ejemplo.test`: no llegan a
-- nadie. Y el comprobante es un archivo de muestra compartido
-- (`demo/comprobante-de-ejemplo.png`), que no es de ninguna reserva de verdad;
-- lo sube `npm run demo:plantilla`.
--
-- Sólo si no existe: correr la migración dos veces no siembra dos plantillas,
-- y retocar la plantilla en producción no se pisa al volver a correrla.
DO $plantilla$
DECLARE
  v_id CONSTANT UUID := 'dede0000-0000-4000-8000-000000000001';
BEGIN
  IF EXISTS (SELECT 1 FROM complejos WHERE es_plantilla_demo) THEN
    RETURN;
  END IF;

  INSERT INTO complejos (
    id, slug, nombre, nombre_corto, descripcion,
    localidad, provincia, direccion,
    whatsapp, instagram, email,
    color_principal, color_fondo, color_texto, color_acento,
    mes_inicio_temporada, porcentaje_sena, horas_vencimiento_sena, reservas_habilitadas,
    datos_transferencia, es_plantilla_demo
  ) VALUES (
    v_id, 'plantilla-demo', 'Cabañas del Sol', 'Del Sol',
    'Cuatro cabañas a dos cuadras del mar, con parrilla y pileta compartida.',
    'Villa Ejemplo', 'Buenos Aires', 'Calle Falsa 123',
    '5490000000000', '@cabaniasdelsol', 'hola@ejemplo.test',
    '#2f5d50', '#f6f4ef', '#1b2b26', '#c2703d',
    12, 50, 6, false,
    E'Alias: cabanias.del.sol\nCBU: 0000003100000000000000\nTitular: Cabañas del Sol SRL',
    true
  );

  INSERT INTO unidades (complejo_id, codigo, nombre, capacidad_maxima, sugerencia_ocupacion, orden) VALUES
    (v_id, 'SOL1', 'Cabaña del Ceibo', 4, 'Máximo 4 personas, ideal 2 adultos y 2 chicos.', 1),
    (v_id, 'SOL2', 'Cabaña del Aljibe', 6, 'Máximo 4 adultos y 2 chicos.', 2),
    (v_id, 'SOL3', 'Cabaña del Molle', 2, 'Para dos.', 3),
    (v_id, 'SOL4', 'Cabaña del Tala', 4, 'Máximo 4 personas.', 4);

  -- Un año exacto: del 1/10/2026 al 29/9/2027 son 364 días, así dos vueltas
  -- seguidas encajan sin pisarse ni dejar un día suelto.
  INSERT INTO config_calendario (complejo_id, primera_fecha, ultima_fecha, minimo_noches)
  VALUES (v_id, NULL, '2027-09-29', 2);

  INSERT INTO minimos_noches (complejo_id, desde, hasta, noches, etiqueta, dias_checkin)
  VALUES (v_id, '2026-12-19', '2027-02-28', 7, 'temporada alta', ARRAY[6,0]::SMALLINT[]);

  INSERT INTO bloques_fijos (complejo_id, check_in, check_out, etiqueta)
  VALUES (v_id, '2027-03-20', '2027-03-24', 'fin de semana largo');

  INSERT INTO objetivos_temporada (complejo_id, temporada, objetivo)
  VALUES (v_id, 2026, 18000000);

  INSERT INTO periodos_precio (complejo_id, desde, hasta, etiqueta)
  VALUES (v_id, '2026-10-01', '2026-12-18', 'primavera'),
         (v_id, '2026-12-19', '2027-02-28', 'temporada alta'),
         (v_id, '2027-03-01', '2027-09-29', 'resto del año');

  INSERT INTO precios_unidad (periodo_id, unidad_id, precio)
  SELECT p.id, u.id,
         CASE p.etiqueta
           WHEN 'temporada alta' THEN
             CASE u.codigo WHEN 'SOL1' THEN 148000 WHEN 'SOL2' THEN 195000 WHEN 'SOL3' THEN 110000 END
           ELSE
             CASE u.codigo WHEN 'SOL1' THEN 72000 WHEN 'SOL2' THEN 95000
                           WHEN 'SOL3' THEN 54000 ELSE 72000 END
         END
    FROM periodos_precio p CROSS JOIN unidades u
   WHERE p.complejo_id = v_id AND u.complejo_id = v_id
     -- La cabaña del Tala queda sin precio en temporada alta, a propósito.
     AND NOT (p.etiqueta = 'temporada alta' AND u.codigo = 'SOL4');

  -- Las fechas caen sábado a sábado, como manda la temporada alta. El sábado
  -- 2 de enero de 2027 es el ancla; las demás se cuentan desde ahí.
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen,
                        huesped_nombre, huesped_email, huesped_telefono, personas, importe,
                        vence_el, comprobante_path, comprobante_subido_el, motivo_estado)
  SELECT v_id, u.id, x.ci::date, x.co::date, x.estado::reserva_estado, x.origen::reserva_origen,
         x.nombre, x.mail, x.tel, x.personas, x.importe,
         CASE WHEN x.estado = 'HOLD_TRANSFER' THEN now() + INTERVAL '4 hours' END,
         x.comprobante,
         CASE WHEN x.comprobante IS NOT NULL THEN now() END,
         x.motivo
    FROM (VALUES
      ('SOL1', '2027-01-02', '2027-01-09', 'CONFIRMED',     'manual',  'Martina Gómez',  'martina@ejemplo.test', '5490000001001', 4, 1036000::numeric, NULL::text, NULL::text),
      ('SOL2', '2027-01-09', '2027-01-16', 'HOLD_TRANSFER', 'web',     'Lucas Pereyra',  'lucas@ejemplo.test',   '5490000001002', 5, 1365000, 'demo/comprobante-de-ejemplo.png', NULL),
      ('SOL3', '2027-01-16', '2027-01-23', 'HOLD_TRANSFER', 'web',     'Carla Ruiz',     'carla@ejemplo.test',   '5490000001003', 2,  770000, NULL, NULL),
      ('SOL1', '2026-12-24', '2026-12-26', 'BLOCKED',       'bloqueo', NULL,             NULL,                   NULL,            NULL,     NULL, NULL, 'Navidad en familia')
    ) AS x(cod, ci, co, estado, origen, nombre, mail, tel, personas, importe, comprobante, motivo)
    JOIN unidades u ON u.complejo_id = v_id AND u.codigo = x.cod;
END
$plantilla$;
