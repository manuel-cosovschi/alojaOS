-- ============================================
-- Las funciones de trigger no son de nadie
-- ============================================
-- Esto lo encontró `verificar-produccion.sql` en su primera corrida contra el
-- proyecto de verdad, y vale contar cómo, porque es el punto del script.
--
-- La prueba local ya comprobaba "quién puede ejecutar qué", pero lo hacía sobre
-- una lista de nombres escrita a mano. Las tres funciones de trigger no estaban
-- en esa lista, así que nadie las miró nunca. El verificador de producción
-- enumera TODO `public` y compara contra la superficie pública; ahí aparecieron:
--
--   slug_inmutable()         acl: {=X/postgres, ...}
--   tocar_updated_at()       acl: {=X/postgres, ...}
--   unidad_es_del_complejo() acl: {=X/postgres, ...}
--
-- Ese `=X/postgres` es EXECUTE concedido a PUBLIC, que es lo que Postgres hace
-- por defecto con toda función nueva. O sea: `anon` podía ejecutarlas.
--
-- ¿Es un agujero? No, y conviene decirlo sin inflarlo: una función que devuelve
-- `trigger` no se puede llamar desde SQL —Postgres contesta «trigger functions
-- can only be called as triggers»— y PostgREST no publica funciones con ese
-- tipo de retorno. No hay forma de llegar.
--
-- Se revoca igual, por dos motivos que sí valen:
--
--   1. Un permiso que dice que `anon` puede ejecutar algo, cuando no queremos
--      que pueda, es un permiso que miente. La próxima vez que alguien lea esa
--      lista va a tener que volver a razonar por qué esas tres están ahí.
--   2. La prueba que las agarró enumera todo. Si se dejan, la prueba queda roja
--      para siempre, y una prueba roja que "se sabe que está bien así" es una
--      prueba apagada: dos semanas después tapa una de verdad.
--
-- También se arregla la lista a mano de la prueba local, que es la que no las
-- vio. Ahora enumera igual que la de producción.

REVOKE EXECUTE ON FUNCTION public.slug_inmutable()         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tocar_updated_at()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unidad_es_del_complejo() FROM PUBLIC;

-- Y de `anon` y `authenticated` por separado: en Supabase el permiso no viene
-- sólo de PUBLIC, viene también de un GRANT explícito por el permiso por
-- defecto del esquema. Revocar de PUBLIC y creer que alcanza ya falló una vez
-- en este proyecto (la migración 008), y el arreglo fue la 010.
REVOKE EXECUTE ON FUNCTION public.slug_inmutable()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tocar_updated_at()       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unidad_es_del_complejo() FROM anon, authenticated;

-- Los triggers no las ejecutan con el permiso del invocador: las corre el
-- motor como parte del INSERT/UPDATE. Revocar no rompe ningún trigger, y eso
-- lo comprueba `prueba-base.sql`, que sigue escribiendo reservas después de
-- esto y falla si alguna de las tres dejó de dispararse.
