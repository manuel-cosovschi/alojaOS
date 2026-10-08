-- ============================================
-- AlojaOS — el comprobante de la seña
-- ============================================
-- El huésped reservó, tiene la unidad guardada unas horas, y ahora transfiere y
-- sube la foto de la transferencia. El dueño la mira y confirma.
--
-- ------------------------------------------------------------------
-- La historia que ordena todo este archivo
-- ------------------------------------------------------------------
-- En el sistema anterior **los comprobantes nunca se guardaron**. Ni uno, desde
-- el primer día, durante meses. La subida contestaba "ok" y el archivo no
-- llegaba a ninguna parte: las funciones eran de un formato al que el hosting no
-- le inyectaba el contexto del almacenamiento, y como el error de guardado se
-- ignoraba *a propósito* —con el argumento razonable de que un problema de
-- almacenamiento no puede cortarle la reserva a un huésped— falló en silencio.
-- El panel decía "sin comprobante" para todos y nadie supo por qué hasta que
-- alguien fue a buscar uno.
--
-- Así que acá:
--
--   1. **El archivo primero, la fila después.** `registrar_comprobante()` se
--      llama cuando el archivo YA está en el almacenamiento. Si el archivo no
--      llegó, no hay fila que diga que llegó.
--   2. **El huésped puede verificarlo él mismo.** `estado_reserva()` ahora dice
--      si el comprobante está registrado. Si la subida falló, lo ve en su
--      pantalla — no hace falta que el dueño lo descubra tres meses después.
--   3. **Un error de almacenamiento no se traga.** El argumento original sigue
--      siendo cierto: la reserva no se cae porque falle la subida. La reserva ya
--      está hecha y la seña sigue viva. Lo que no se hace es decir que el
--      comprobante llegó.
--
-- ------------------------------------------------------------------
-- Dónde transferir
-- ------------------------------------------------------------------
-- Dato del complejo, no del producto: cada dueño cobra en su cuenta.

ALTER TABLE complejos
  ADD COLUMN IF NOT EXISTS datos_transferencia TEXT;

COMMENT ON COLUMN complejos.datos_transferencia IS
  'Alias, CBU y titular, como el dueño quiera escribirlo. Se le muestra al huésped junto con el monto de la seña.';

-- ------------------------------------------------------------------
-- El comprobante en la reserva
-- ------------------------------------------------------------------
ALTER TABLE reservas
  -- La ruta dentro del almacenamiento. NULL = no llegó, y eso es la verdad, no
  -- un valor por defecto que después nadie revisa.
  ADD COLUMN IF NOT EXISTS comprobante_path TEXT,
  ADD COLUMN IF NOT EXISTS comprobante_subido_el TIMESTAMPTZ,
  -- Por qué el dueño rechazó la seña, si la rechazó. Lo lee él, no el huésped:
  -- un motivo escrito para uso interno no es un mensaje para una persona.
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

-- Las dos cosas van juntas o no van: una ruta sin fecha, o una fecha sin ruta,
-- es media verdad, y media verdad acá es exactamente el bug de antes.
ALTER TABLE reservas ADD CONSTRAINT comprobante_entero
  CHECK ((comprobante_path IS NULL) = (comprobante_subido_el IS NULL));

CREATE INDEX IF NOT EXISTS reservas_con_comprobante_idx
  ON reservas (complejo_id, comprobante_subido_el DESC)
  WHERE comprobante_path IS NOT NULL;

-- ============================================
-- Dónde se guardan los archivos
-- ============================================
-- Bucket privado. Un comprobante de transferencia tiene el nombre, el banco y a
-- veces el CUIT de una persona: no hay lectura pública de ningún tipo, y el
-- dueño lo mira con una URL firmada de vida corta que arma el servidor.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprobantes',
  'comprobantes',
  false,
  8388608, -- 8 MB: una foto de celular entra de sobra
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ------------------------------------------------------------------
-- Quién puede leer los archivos: nadie, salvo el servidor
-- ------------------------------------------------------------------
-- `storage.objects` tiene RLS prendido y **ninguna policy**. Eso no es un
-- olvido: con RLS prendido y cero policies, `anon` y `authenticated` no leen,
-- no escriben y no listan nada, aunque la tabla les tenga los GRANT puestos
-- (Supabase los pone por defecto y deja que RLS decida). El único acceso es el
-- del servidor con la clave de servicio, que tiene BYPASSRLS.
--
-- Acá había dos policies que le daban lectura y borrado al dueño logueado sobre
-- la carpeta de su complejo. Se sacaron por dos motivos, en este orden:
--
--   1. No se pueden crear. En un proyecto Supabase administrado,
--      `storage.objects` es de `supabase_storage_admin`, y el rol con el que
--      corren las migraciones (`postgres`) no es miembro de ese rol. El
--      `CREATE POLICY` no entra. Tenerlas en el archivo las hacía existir en la
--      base local y no en la de verdad: dos bases distintas, y las pruebas
--      corriendo contra la que no es. Ese error ya lo cometí una vez en este
--      proyecto con los permisos de `anon`, y es el mismo error.
--
--   2. No hacen falta. El huésped sube por una acción del servidor, y el dueño
--      va a mirar el archivo por una URL firmada que también arma el servidor.
--      Ninguno de los dos caminos pasa por RLS. Una policy que nada usa no es
--      defensa en profundidad: es una regla que nadie prueba.
--
-- La consecuencia, para que esté escrita antes de que haga falta: **el panel
-- del dueño no va a poder pedirle el archivo al almacenamiento desde el
-- navegador.** Tiene que pedírselo al servidor, que es donde se comprueba que
-- ese dueño es miembro de ese complejo sin creerle al cliente. Es la decisión
-- correcta igual.
--
-- Y el día que se agregue otro bucket (fotos de las unidades, por ejemplo) con
-- una policy de lectura: esa policy TIENE que filtrar por `bucket_id`. Una
-- policy permisiva sin ese filtro abre todos los buckets, incluido éste.
--
-- La convención de rutas sigue siendo `<complejo_id>/<reserva_id>/<archivo>`:
-- la arma el servidor, no quien sube, y deja los archivos agrupados por
-- complejo para el día que haya que borrar los de uno.

-- ============================================
-- Registrar que el comprobante llegó
-- ============================================
-- Se llama DESPUÉS de que el archivo está guardado. Devuelve qué pasó, con
-- motivo, y nunca dice que sí sin haber escrito.
CREATE OR REPLACE FUNCTION public.registrar_comprobante(
  p_reserva UUID,
  p_path    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v reservas%ROWTYPE;
BEGIN
  IF p_path IS NULL OR length(trim(p_path)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_archivo');
  END IF;

  -- Soltar lo vencido antes de mirar: si no, un hold que ya murió aceptaría un
  -- comprobante y el huésped creería que llegó a tiempo.
  PERFORM public.liberar_vencidas();

  SELECT * INTO v FROM reservas WHERE id = p_reserva FOR UPDATE;
  IF NOT FOUND THEN
    -- Mismo texto que para una reserva de otro: un id que no existe y un id
    -- ajeno contestan lo mismo.
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  IF v.estado = 'EXPIRED' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'vencida',
      'mensaje', 'Se pasó el plazo y las fechas se liberaron. Escribinos y lo vemos.');
  END IF;

  IF v.estado <> 'HOLD_TRANSFER' THEN
    -- Ya confirmada, cancelada o es un bloqueo: no está esperando nada.
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_espera_sena',
      'estado', v.estado);
  END IF;

  -- Que se pueda volver a subir es a propósito: la primera foto sale mal más
  -- seguido de lo que uno quisiera. Se queda la última y la fecha se actualiza.
  UPDATE reservas
     SET comprobante_path = p_path,
         comprobante_subido_el = now()
   WHERE id = p_reserva;

  RETURN jsonb_build_object(
    'ok', true,
    'reemplazo', v.comprobante_path IS NOT NULL,
    'anterior', v.comprobante_path
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_comprobante(UUID, TEXT) FROM PUBLIC, anon, authenticated;
-- La llama el servidor con la clave de servicio, no el navegador: si `anon`
-- pudiera, escribiría la ruta que quisiera en la reserva de cualquiera.
GRANT EXECUTE ON FUNCTION public.registrar_comprobante(UUID, TEXT) TO service_role;

-- ============================================
-- El huésped puede comprobar que llegó
-- ============================================
-- `estado_reserva()` ahora dice si el comprobante está registrado. Esto es lo
-- que hace que el bug anterior no pueda durar meses: el que subió el archivo ve
-- en su propia pantalla si el sistema lo tiene.
CREATE OR REPLACE FUNCTION public.estado_reserva(p_reserva UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v JSONB;
BEGIN
  PERFORM public.liberar_vencidas();

  SELECT jsonb_build_object(
           'estado', r.estado,
           'vence_el', r.vence_el,
           -- Si el sistema tiene el comprobante. No la ruta: el huésped no
           -- necesita saber dónde está guardado, y publicarla sería dar la
           -- dirección del archivo de una persona.
           'comprobante', r.comprobante_path IS NOT NULL,
           'comprobante_subido_el', r.comprobante_subido_el
         )
    INTO v
    FROM reservas r
   WHERE r.id = p_reserva;

  RETURN coalesce(v, jsonb_build_object(
    'estado', NULL, 'vence_el', NULL, 'comprobante', false, 'comprobante_subido_el', NULL));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.estado_reserva(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.estado_reserva(UUID) TO anon, authenticated;

-- ============================================
-- El dueño decide
-- ============================================
-- Aprobar no vuelve a chequear la superposición y no hace falta: un
-- HOLD_TRANSFER ya ocupa la unidad, así que pasar a CONFIRMED no libera ni toma
-- ninguna noche nueva. La restricción de exclusión cubre los dos estados.
CREATE OR REPLACE FUNCTION public.aprobar_sena(p_reserva UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v reservas%ROWTYPE;
BEGIN
  PERFORM public.liberar_vencidas();

  SELECT * INTO v FROM reservas WHERE id = p_reserva FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  IF NOT public.es_miembro(v.complejo_id) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v.estado = 'CONFIRMED' THEN
    -- Repetir no rompe nada ni duplica nada, y decirlo es mejor que fingir que
    -- esta llamada hizo algo.
    RETURN jsonb_build_object('ok', true, 'ya_estaba', true);
  END IF;

  IF v.estado <> 'HOLD_TRANSFER' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_espera_sena', 'estado', v.estado);
  END IF;

  UPDATE reservas
     SET estado = 'CONFIRMED',
         aprobada_el = now(),
         -- El vencimiento deja de tener sentido: ya no se le guarda el lugar,
         -- lo tiene. Dejarlo cargado haría que `salud_vencimientos` cuente como
         -- atrasada una reserva que está confirmada.
         vence_el = NULL,
         motivo_estado = NULL
   WHERE id = p_reserva;

  RETURN jsonb_build_object('ok', true, 'ya_estaba', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aprobar_sena(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.aprobar_sena(UUID) TO authenticated;

-- Rechazar libera las noches. El motivo queda guardado para el dueño.
CREATE OR REPLACE FUNCTION public.rechazar_sena(p_reserva UUID, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v reservas%ROWTYPE;
BEGIN
  SELECT * INTO v FROM reservas WHERE id = p_reserva FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  IF NOT public.es_miembro(v.complejo_id) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v.estado NOT IN ('HOLD_TRANSFER', 'CONFIRMED') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_se_puede_rechazar', 'estado', v.estado);
  END IF;

  UPDATE reservas
     SET estado = 'CANCELLED',
         cancelada_el = now(),
         vence_el = NULL,
         motivo_rechazo = p_motivo,
         motivo_estado = 'La seña no se aprobó.'
   WHERE id = p_reserva;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rechazar_sena(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rechazar_sena(UUID, TEXT) TO authenticated;

-- ============================================
-- Lo que el panel necesita para revisar
-- ============================================
-- `reservas_pendientes()` ahora dice si cada seña tiene su comprobante. Sin eso
-- el dueño no puede saber a quién le falta, que es justo lo que va a mirar.
--
-- ------------------------------------------------------------------
-- Por qué la corre a un costado en vez de borrarla
-- ------------------------------------------------------------------
-- Le estamos agregando columnas de salida, y Postgres no deja cambiarle el tipo
-- de retorno a una función que ya existe: contesta «cannot change return type of
-- existing function». Lo natural sería `DROP` y volver a crearla.
--
-- No se puede. La herramienta con la que se aplican estas migraciones al
-- proyecto trata cualquier `DROP` como una operación destructiva y pide que una
-- persona la confirme; cuando esa confirmación no llega a ningún lado, la
-- llamada se cuelga y se corta sin hacer nada. O sea: con `DROP`, esta migración
-- entra en la base local y NO en la de producción. Dos bases distintas, que es
-- el problema que este archivo ya resolvió una vez más arriba con las policies
-- de storage.
--
-- `ALTER FUNCTION ... RENAME TO` no es destructivo y sí entra. Así que la vieja
-- se corre a un costado, el nombre queda libre, y la nueva se crea con el nombre
-- que le corresponde. El código y las pruebas no cambian.
--
-- Lo que queda: una función de más, `reservas_pendientes_sin_comprobante`, que
-- no le sirve a nadie. Se le revoca el EXECUTE a todos los roles de la API, así
-- que PostgREST la publica y contesta 403. Está igual en la base local y en la
-- de producción, que es la propiedad que importa, y el día que haya una
-- herramienta que pueda correr un `DROP` se va con una línea:
-- `supabase/a_mano/01_sacar_la_funcion_vieja.sql`.
DO $renombrar$
BEGIN
  -- Guardado y por la forma, no por el nombre: si la que está no tiene la
  -- columna del comprobante, es la vieja. Así esto se puede volver a correr
  -- sobre una base que ya lo tiene aplicado sin romper nada.
  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'reservas_pendientes'
       AND pronamespace = 'public'::regnamespace
       AND NOT ('comprobante_path' = ANY (coalesce(proargnames, ARRAY[]::TEXT[])))
  ) THEN
    ALTER FUNCTION public.reservas_pendientes(UUID)
      RENAME TO reservas_pendientes_sin_comprobante;
  END IF;
END
$renombrar$;

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
  created_at       TIMESTAMPTZ,
  comprobante_path TEXT,
  comprobante_subido_el TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.liberar_vencidas();

  RETURN QUERY
    SELECT r.id, r.unidad_id, u.codigo, r.check_in, r.check_out,
           r.huesped_nombre, r.huesped_telefono, r.huesped_email,
           r.personas, r.importe, r.vence_el, r.created_at,
           r.comprobante_path, r.comprobante_subido_el
      FROM reservas r
      JOIN unidades u ON u.id = r.unidad_id
     WHERE r.complejo_id = p_complejo
       AND r.estado = 'HOLD_TRANSFER'
     ORDER BY r.vence_el;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reservas_pendientes(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reservas_pendientes(UUID) TO authenticated;

-- La vieja, muerta para la API. No se puede borrar (ver arriba), pero sí dejar
-- que no la pueda llamar nadie: PostgREST la va a publicar igual y va a
-- contestar 403. Una función que devuelve la lista del panel sin la columna del
-- comprobante es exactamente el dato viejo que haría creer que a nadie le falta.
DO $cerrar_la_vieja$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'reservas_pendientes_sin_comprobante'
       AND pronamespace = 'public'::regnamespace
  ) THEN
    REVOKE ALL ON FUNCTION public.reservas_pendientes_sin_comprobante(UUID)
      FROM PUBLIC, anon, authenticated;
  END IF;
END
$cerrar_la_vieja$;

-- ============================================
-- Y el dato de transferencia en lo público
-- ============================================
-- La página tiene que poder decirle al huésped dónde transferir. Es un dato que
-- el dueño publica a propósito: el mismo que mandaría por mensaje.
CREATE OR REPLACE FUNCTION public.datos_para_transferir(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'datos_transferencia', c.datos_transferencia,
           'moneda', c.moneda,
           'whatsapp', c.whatsapp
         )
    FROM complejos c
   WHERE c.slug = lower(p_slug);
$$;

REVOKE EXECUTE ON FUNCTION public.datos_para_transferir(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.datos_para_transferir(TEXT) TO anon, authenticated;
