-- ============================================
-- ¿Producción tiene la MISMA versión de cada función que el repo?
-- ============================================
-- Se corre dos veces y se comparan las salidas:
--
--   psql "$DATABASE_URL_PRODUCCION" -f scripts/huellas-de-funciones.sql > /tmp/prod.txt
--   # y contra la base local del arnés, que sale de aplicar las migraciones:
--   ./scripts/prueba-local.sh --huellas                     > /tmp/repo.txt
--   diff /tmp/prod.txt /tmp/repo.txt
--
-- (O pegándolo en el SQL Editor de Supabase y comparando a ojo con la salida
-- local, que son treinta y pico de líneas.)
--
-- ------------------------------------------------------------------
-- Para qué, si ya existe `verificar-produccion.sql`
-- ------------------------------------------------------------------
-- Ese comprueba que las cosas EXISTAN y que los permisos sean los que tienen
-- que ser. No comprueba que el cuerpo de una función sea el del repo, y esa es
-- una diferencia que ya me morí́ encima: cuando una migración se aplica a medias
-- —porque la herramienta con la que la aplico se corta, ver
-- `supabase/a_mano/README.md`— puede quedar en producción la versión ANTERIOR
-- de una función. Existe, está concedida, contesta, y hace otra cosa.
--
-- `md5(prosrc)` es el cuerpo exacto, comentarios incluidos: lo que está entre
-- los `$$` se guarda tal cual. Así que dos huellas iguales son dos funciones
-- idénticas, y dos distintas son dos versiones distintas, sin lugar a dudas.
--
-- No va adentro de `verificar-produccion.sql` porque ese archivo se corre solo
-- y contesta ok/FALTA por sí mismo. Esto necesita las dos bases para decir
-- algo, y una huella sola no significa nada.

SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS funcion,
       md5(p.prosrc) AS huella,
       CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END AS seguridad,
       coalesce(array_to_string(p.proconfig, ','), '-') AS config
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   -- Las de las extensiones no son del repo.
   AND NOT EXISTS (
     SELECT 1 FROM pg_depend d
      WHERE d.objid = p.oid AND d.deptype = 'e'
   )
 ORDER BY 1;
