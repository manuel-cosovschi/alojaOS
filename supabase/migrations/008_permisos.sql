-- ============================================
-- AlojaOS — que los permisos digan lo que parecen decir
-- ============================================
-- Postgres le da EXECUTE a PUBLIC sobre toda función nueva. O sea que los
-- `GRANT EXECUTE ... TO anon` de las migraciones anteriores no estaban
-- habilitando nada: ya estaba habilitado para todos, y de paso quedaban
-- habilitadas las que nadie concedió.
--
-- Eso tiene dos consecuencias malas y ninguna buena:
--
--   1. Leer el código no dice quién puede llamar qué. Un `GRANT` explícito al
--      lado de una función da la impresión de que ahí está la decisión, y la
--      decisión en realidad no se tomó.
--   2. El día que haya que cerrar una función, revocarla de `anon` no va a
--      alcanzar, porque el permiso entra por PUBLIC. Se descubriría probando.
--
-- Así que acá se le saca a PUBLIC y se concede a mano, una por una. La lista de
-- abajo es la superficie pública del producto: si algo no está, no se llama
-- desde afuera.
--
-- Las funciones de trigger quedan afuera a propósito: Postgres chequea el
-- permiso al CREAR el trigger, no al dispararlo, y tocarlas no agrega
-- seguridad pero sí agrega formas de romper un UPDATE.

-- ============================================
-- Lo que llama la página pública, sin sesión
-- ============================================
REVOKE EXECUTE ON FUNCTION public.complejo_publico(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complejo_publico(TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.noches_ocupadas(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.noches_ocupadas(UUID, UUID) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.estado_reserva(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.estado_reserva(UUID) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cotizar_estadia(UUID, DATE, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cotizar_estadia(UUID, DATE, DATE) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.crear_reserva(
  TEXT, UUID, DATE, DATE, SMALLINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_reserva(
  TEXT, UUID, DATE, DATE, SMALLINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) TO anon, authenticated;

-- ============================================
-- Lo que usa el panel, con sesión
-- ============================================
REVOKE EXECUTE ON FUNCTION public.temporada_de(UUID, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.temporada_de(UUID, DATE) TO authenticated;

-- `es_miembro` y `complejo_de_unidad` las llaman las policies, que corren con
-- la sesión de quien consulta: `authenticated` las necesita. `anon` no, porque
-- no tiene policy en ninguna tabla.
REVOKE EXECUTE ON FUNCTION public.es_miembro(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.es_miembro(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complejo_de_unidad(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complejo_de_unidad(UUID) TO authenticated;

-- ============================================
-- Lo que no se llama desde afuera
-- ============================================
-- `liberar_vencidas` escribe. La llaman las funciones de arriba, que son
-- SECURITY DEFINER y corren como dueñas. Desde afuera sería una forma de
-- soltarle las noches a otro complejo.
REVOKE EXECUTE ON FUNCTION public.liberar_vencidas(UUID) FROM PUBLIC, anon, authenticated;

-- Y que las funciones nuevas no nazcan abiertas a todo el mundo.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
