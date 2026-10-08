-- ============================================
-- AlojaOS — lo que apareció al aplicar el esquema en Supabase de verdad
-- ============================================
-- Las nueve migraciones anteriores se probaron contra un Postgres local y
-- pasaban. Al aplicarlas a un proyecto de Supabase aparecieron tres cosas, y la
-- tercera es la que importa, porque explica por qué no se habían visto.
--
-- ------------------------------------------------------------------
-- 1. El `search_path` de las dos funciones de trigger
-- ------------------------------------------------------------------
-- Les puse `SET search_path = public` a todas las funciones menos a estas dos, y
-- fue un olvido, no una decisión. Una función sin `search_path` fijo resuelve los
-- nombres con el del invocador, así que quien pueda crear un objeto en un
-- esquema que esté antes en su `search_path` puede hacer que la función llame a
-- otra cosa. Estas dos no son SECURITY DEFINER, así que el riesgo es menor, pero
-- el arreglo es gratis.
--
-- ------------------------------------------------------------------
-- 2. `btree_gist` vivía en `public`
-- ------------------------------------------------------------------
-- `public` es el esquema que Supabase expone como API, así que una extensión ahí
-- le agrega decenas de funciones (`gbt_*`, `*_dist`) a la superficie pública y
-- puede chocar con nombres propios.
--
-- Mover una extensión de la que depende la restricción que sostiene el producto
-- entero da miedo, así que lo probé antes: la clase de operadores por defecto de
-- un `EXCLUDE USING gist` se resuelve por tipo y método de acceso, no por
-- `search_path`, así que ni la creación de la restricción ni su funcionamiento
-- dependen de dónde esté la extensión. Comprobado creando la restricción con
-- `search_path = public` y verificando que siga rechazando los rangos que se
-- pisan y aceptando los pegados.
--
-- ------------------------------------------------------------------
-- 3. `anon` podía ejecutar tres funciones que no son para él
-- ------------------------------------------------------------------
-- Y acá está la lección. La migración 008 dice que los permisos tienen que decir
-- lo que parecen decir, y revocaba `EXECUTE` de PUBLIC. En Supabase eso no
-- alcanza: el proyecto trae `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS
-- TO anon, authenticated, service_role`, así que cada función nace con un permiso
-- EXPLÍCITO para `anon`, y revocar de PUBLIC no lo toca.
--
-- El arnés local no reproducía esa concesión. O sea: la prueba que existe para
-- que los permisos no mientan estaba corriendo contra una base donde los
-- permisos eran otros. El arnés quedó arreglado junto con esta migración, y
-- `prueba-base.sql` ahora afirma quién puede ejecutar qué, en vez de confiar en
-- que el `GRANT` de al lado dijo la verdad.
--
-- Las que SÍ son para `anon` quedan como están, y son una decisión: la página
-- pública no tiene sesión, así que `complejo_publico`, `noches_ocupadas`,
-- `estado_reserva`, `cotizar_estadia` y `crear_reserva` tienen que poder
-- llamarse sin cuenta. Son SECURITY DEFINER a propósito y cada una decide
-- adentro qué devuelve: ninguna acepta el estado ni el importe de una reserva,
-- ninguna devuelve datos de un huésped, y `crear_reserva` sólo puede dejar una
-- seña pendiente. El linter de Supabase las va a seguir marcando, y está bien
-- que lo haga: no puede saber la intención.

-- ============================================
-- 1. search_path en las funciones de trigger
-- ============================================
ALTER FUNCTION public.tocar_updated_at() SET search_path = public;
ALTER FUNCTION public.slug_inmutable()   SET search_path = public;

-- ============================================
-- 2. La extensión fuera del esquema expuesto
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE SCHEMA extensions;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'btree_gist' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION btree_gist SET SCHEMA extensions;
  END IF;
END $$;

GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- ============================================
-- 3. Sacarle a `anon` lo que no es para él
-- ============================================
-- Las policies llaman a estas dos con la sesión de quien consulta, así que las
-- necesita `authenticated`. `anon` no tiene policy en ninguna tabla, así que no
-- las necesita — y `complejo_de_unidad` le diría, dado el id de una unidad, a
-- qué complejo pertenece.
REVOKE EXECUTE ON FUNCTION public.es_miembro(UUID)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.complejo_de_unidad(UUID) FROM anon;

-- Es del panel, no de la página.
REVOKE EXECUTE ON FUNCTION public.temporada_de(UUID, DATE) FROM anon;

-- Y que las funciones nuevas no nazcan concedidas a `anon` sin que nadie lo
-- haya decidido. Esto es lo que faltaba en la 008: revocaba de PUBLIC, que en
-- Supabase no es de donde viene el permiso.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
