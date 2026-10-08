-- ============================================
-- ¿La base de verdad tiene lo que dice el repo?
-- ============================================
-- Se corre contra el proyecto de Supabase, pegándolo en el editor SQL del panel
-- (Database → SQL Editor) o con psql y la cadena de conexión del proyecto.
--
-- Para qué: `prueba-base.sql` corre contra un Postgres local y comprueba que las
-- reglas funcionen. Esto comprueba otra cosa, que no es lo mismo y ya falló una
-- vez: que la base de producción **sea** la que dicen las migraciones. Un
-- esquema a medio aplicar contesta bien a casi todo y mal a una cosa, y esa una
-- cosa aparece el día que un huésped la usa.
--
-- No escribe nada. No lee datos de nadie: sólo el catálogo.
--
-- Lo que hay que leer es la última columna. Si dice FALTA en alguna fila, la
-- base de producción no es la del repo, y lo que sigue abajo de esa fila dice
-- qué falta.

WITH esperado(orden, que, existe) AS (
  VALUES
  -- --- 001-010: el núcleo ------------------------------------------------
  (10, 'tabla complejos',
       (SELECT count(*) = 1 FROM pg_class WHERE relname='complejos' AND relnamespace='public'::regnamespace)),
  (11, 'tabla unidades',
       (SELECT count(*) = 1 FROM pg_class WHERE relname='unidades' AND relnamespace='public'::regnamespace)),
  (12, 'tabla reservas',
       (SELECT count(*) = 1 FROM pg_class WHERE relname='reservas' AND relnamespace='public'::regnamespace)),

  -- La regla que no puede fallar: nunca dos reservas sobre la misma unidad y la
  -- misma noche. Si esta fila dice FALTA, el sistema puede sobrevender.
  (20, 'restricción de exclusión reservas_sin_superponer',
       (SELECT count(*) = 1 FROM pg_constraint
         WHERE conname='reservas_sin_superponer' AND contype='x')),
  (21, 'btree_gist instalada (sin ella la exclusión no existe)',
       (SELECT count(*) = 1 FROM pg_extension WHERE extname='btree_gist')),
  (22, 'la columna noches es generada con bordes [)',
       (SELECT a.attgenerated <> ''
          FROM pg_attribute a
         WHERE a.attrelid='public.reservas'::regclass AND a.attname='noches')),
  (23, 'un HOLD_TRANSFER no puede quedar sin vencimiento',
       (SELECT count(*) = 1 FROM pg_constraint WHERE conname='hold_con_vencimiento')),

  -- --- 011: el comprobante ----------------------------------------------
  (30, 'complejos.datos_transferencia',
       (SELECT count(*) = 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='complejos' AND column_name='datos_transferencia')),
  (31, 'reservas.comprobante_path',
       (SELECT count(*) = 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='reservas' AND column_name='comprobante_path')),
  (32, 'reservas.comprobante_subido_el',
       (SELECT count(*) = 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='reservas' AND column_name='comprobante_subido_el')),
  (33, 'reservas.motivo_rechazo',
       (SELECT count(*) = 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='reservas' AND column_name='motivo_rechazo')),
  (34, 'la ruta y su fecha van juntas o no van (comprobante_entero)',
       (SELECT count(*) = 1 FROM pg_constraint WHERE conname='comprobante_entero')),

  (40, 'el bucket comprobantes existe y es privado',
       (SELECT count(*) = 1 FROM storage.buckets WHERE id='comprobantes' AND public = false)),
  (41, 'el bucket no acepta más de 8 MB',
       (SELECT count(*) = 1 FROM storage.buckets WHERE id='comprobantes' AND file_size_limit = 8388608)),
  (42, 'el bucket sólo acepta imágenes y PDF',
       (SELECT count(*) = 1 FROM storage.buckets
         WHERE id='comprobantes'
           AND allowed_mime_types @> ARRAY['image/jpeg','application/pdf']
           AND NOT (allowed_mime_types @> ARRAY['text/html']))),
  (43, 'storage.objects tiene RLS prendido',
       (SELECT relrowsecurity FROM pg_class
         WHERE relname='objects' AND relnamespace='storage'::regnamespace)),
  -- Cerrado por ausencia de policies, a propósito. Ver el comentario largo en
  -- 011_comprobantes.sql: el acceso es del servidor con la clave de servicio, y
  -- una policy acá no se puede crear ni hace falta. Si aparece una, hay que
  -- mirarla: una policy permisiva sin filtro por bucket_id abre este también.
  (44, 'ninguna policy sobre storage.objects',
       (SELECT count(*) = 0 FROM pg_policies WHERE schemaname='storage' AND tablename='objects')),
  (45, 'sólo service_role pasa por encima de RLS',
       (SELECT bool_and(CASE WHEN rolname='service_role' THEN rolbypassrls ELSE NOT rolbypassrls END)
          FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))),

  -- --- Las funciones, con la forma que el código espera -------------------
  (50, 'crear_reserva()',
       (SELECT count(*) = 1 FROM pg_proc WHERE proname='crear_reserva' AND pronamespace='public'::regnamespace)),
  (51, 'registrar_comprobante()',
       (SELECT count(*) = 1 FROM pg_proc WHERE proname='registrar_comprobante' AND pronamespace='public'::regnamespace)),
  (52, 'aprobar_sena()',
       (SELECT count(*) = 1 FROM pg_proc WHERE proname='aprobar_sena' AND pronamespace='public'::regnamespace)),
  (53, 'rechazar_sena()',
       (SELECT count(*) = 1 FROM pg_proc WHERE proname='rechazar_sena' AND pronamespace='public'::regnamespace)),
  (54, 'datos_para_transferir()',
       (SELECT count(*) = 1 FROM pg_proc WHERE proname='datos_para_transferir' AND pronamespace='public'::regnamespace)),
  (55, 'liberar_vencidas()',
       (SELECT count(*) = 1 FROM pg_proc WHERE proname='liberar_vencidas' AND pronamespace='public'::regnamespace)),
  (56, 'salud_vencimientos()',
       (SELECT count(*) = 1 FROM pg_proc WHERE proname='salud_vencimientos' AND pronamespace='public'::regnamespace)),

  -- `estado_reserva()` es la que le deja comprobar al huésped que su
  -- comprobante llegó. Si devolviera la versión vieja, la pantalla diría
  -- siempre que no llegó, que es el bug de antes al revés.
  (57, 'estado_reserva() informa el comprobante',
       (SELECT 'comprobante' = ANY (
          SELECT jsonb_object_keys(public.estado_reserva('00000000-0000-0000-0000-000000000000'))))),
  -- Y no la ruta del archivo: eso es la dirección del comprobante de alguien.
  (58, 'estado_reserva() NO publica la ruta del archivo',
       (SELECT 'comprobante_path' <> ALL (
          SELECT jsonb_object_keys(public.estado_reserva('00000000-0000-0000-0000-000000000000'))))),

  -- La que el panel va a usar para saber a quién le falta el comprobante.
  (59, 'reservas_pendientes() incluye el comprobante',
       (SELECT count(*) = 1 FROM pg_proc
         WHERE proname='reservas_pendientes' AND pronamespace='public'::regnamespace
           AND 'comprobante_path' = ANY (proargnames))),

  -- La versión vieja quedó corrida a un costado porque no se la puede borrar
  -- desde el conector (ver el comentario en 011). Las dos situaciones son
  -- correctas y esta fila acepta las dos: o no está, o está y no la puede
  -- llamar nadie. Lo que NO es correcto es que esté y sea alcanzable: devuelve
  -- la lista del panel sin la columna del comprobante, o sea el dato viejo que
  -- haría creer que a nadie le falta.
  (60, 'la reservas_pendientes vieja no está, o no la puede llamar nadie',
       (SELECT count(*) = 0 FROM pg_proc p
         WHERE p.proname='reservas_pendientes_sin_comprobante'
           AND p.pronamespace='public'::regnamespace
           AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('authenticated', p.oid, 'EXECUTE')))),

  -- --- Los permisos: que no mientan ---------------------------------------
  -- Esto ya falló una vez: una migración revocaba "de PUBLIC" y Supabase le
  -- había dado EXECUTE a `anon` con un permiso explícito, que es de donde
  -- viene. La migración decía que cerraba y no cerraba nada.
  (70, 'anon NO puede registrar_comprobante()',
       NOT has_function_privilege('anon', 'public.registrar_comprobante(uuid,text)', 'EXECUTE')),
  (71, 'authenticated NO puede registrar_comprobante()',
       NOT has_function_privilege('authenticated', 'public.registrar_comprobante(uuid,text)', 'EXECUTE')),
  (72, 'service_role SÍ puede registrar_comprobante()',
       has_function_privilege('service_role', 'public.registrar_comprobante(uuid,text)', 'EXECUTE')),
  (73, 'anon NO puede aprobar_sena()',
       NOT has_function_privilege('anon', 'public.aprobar_sena(uuid)', 'EXECUTE')),
  (74, 'anon NO puede rechazar_sena()',
       NOT has_function_privilege('anon', 'public.rechazar_sena(uuid,text)', 'EXECUTE')),
  (75, 'anon NO puede es_miembro()',
       NOT has_function_privilege('anon', 'public.es_miembro(uuid)', 'EXECUTE')),
  (76, 'anon NO puede liberar_vencidas()',
       NOT has_function_privilege('anon', 'public.liberar_vencidas(uuid)', 'EXECUTE')),
  (77, 'anon SÍ puede estado_reserva() (la usa el huésped)',
       has_function_privilege('anon', 'public.estado_reserva(uuid)', 'EXECUTE')),
  (78, 'anon SÍ puede datos_para_transferir()',
       has_function_privilege('anon', 'public.datos_para_transferir(text)', 'EXECUTE')),
  (79, 'anon SÍ puede crear_reserva() (es quien reserva)',
       has_function_privilege('anon',
         'public.crear_reserva(text,uuid,date,date,smallint,text,text,text,text,jsonb,text,text)', 'EXECUTE')),

  -- La forma fuerte de la pregunta anterior: en vez de revisar los permisos por
  -- defecto, se enumera TODO `public` y se compara con la lista de lo que el
  -- producto expone a propósito. Así da igual de dónde salió el permiso.
  --
  -- Hace falta que sea así y no por permisos por defecto: los permisos por
  -- defecto en Postgres son POR ROL QUE CREA. En el proyecto hay dos entradas
  -- para funciones de `public`, una puesta por `postgres` (la que arregló la
  -- migración 010, sin `anon`) y otra puesta por `supabase_admin` (con `anon`).
  -- Las migraciones corren como `postgres`, así que la que aplica es la primera.
  -- La de `supabase_admin` no se puede tocar desde acá —`postgres` no es miembro
  -- de ese rol— y queda como una trampa para cualquier función que cree el
  -- panel de Supabase en vez de una migración. Esta fila la agarraría.
  (80, 'anon puede ejecutar exactamente la superficie pública, y nada más',
       (SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname), ARRAY[]::TEXT[])
          FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND p.prokind = 'f'
           AND has_function_privilege('anon', p.oid, 'EXECUTE')
       ) = ARRAY['complejo_publico','cotizar_estadia','crear_reserva',
                 'datos_para_transferir','estado_reserva','noches_ocupadas']),

  -- Sin `search_path` fijo, una función SECURITY DEFINER resuelve los nombres
  -- con el esquema del que la llama.
  (81, 'todas las funciones de public fijan su search_path',
       (SELECT count(*) = 0 FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND p.prokind IN ('f', 'p')
           AND NOT EXISTS (
             SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::TEXT[])) c
              WHERE c LIKE 'search\_path=%'))),

  (82, 'btree_gist no está en el esquema que se expone como API',
       (SELECT n.nspname <> 'public' FROM pg_extension e
          JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'btree_gist')),

  -- --- RLS en las tablas --------------------------------------------------
  (90, 'RLS prendido en todas las tablas de public',
       (SELECT count(*) = 0 FROM pg_class c
         WHERE c.relnamespace='public'::regnamespace
           AND c.relkind='r'
           AND NOT c.relrowsecurity))
)
SELECT orden,
       que AS "lo que el repo dice que tiene que haber",
       CASE WHEN existe THEN 'ok' ELSE 'FALTA' END AS resultado
  FROM esperado
 ORDER BY orden;
