-- ============================================
-- El registro de qué migración está aplicada
-- ============================================
-- `scripts/migrate.ts` corría TODAS las migraciones desde la 001 en cada
-- invocación. Contra un proyecto vacío eso anda; contra uno que ya tiene las
-- primeras quince aplicadas, muere en la 002 con «relation reservas already
-- exists» y nunca llega a la que falta.
--
-- O sea: la herramienta que el repo documenta como «el camino bueno» para
-- aplicar migraciones sólo servía una vez, el primer día. Lo descubrí al
-- necesitarla.
--
-- ------------------------------------------------------------------
-- Por qué no alcanza con hacer las migraciones idempotentes
-- ------------------------------------------------------------------
-- `CREATE TABLE IF NOT EXISTS` en todas las 001-015 haría que volver a
-- correrlas no falle, pero tampoco haría nada: una migración que agrega una
-- columna o una restricción no se puede escribir «idempotente» sin llenarla de
-- `DO` con `IF NOT EXISTS` a mano, y ahí el archivo deja de leerse como lo que
-- hace. Y peor: una que se aplicó a medias quedaría indistinguible de una
-- aplicada entera.
--
-- Un registro de lo aplicado es lo que usan todas las herramientas de
-- migración que funcionan, y además deja contestar una pregunta que hoy no
-- tiene respuesta: ¿cuándo se aplicó cada una, y el archivo cambió desde
-- entonces?
--
-- ------------------------------------------------------------------
-- Por qué en su propio esquema y no en `public`
-- ------------------------------------------------------------------
-- Supabase expone `public` por la API REST. Una tabla ahí es una tabla que
-- PostgREST publica, y aunque RLS la deje vacía para todos, es una superficie
-- más que no hace falta: esto no es un dato de ningún complejo, es metadato del
-- producto.
--
-- `sistema` no está en los esquemas expuestos, así que no existe para la API.
--
-- El DDL es idempotente a propósito y está duplicado en `scripts/migrate.ts`:
-- el script tiene que poder crear el registro antes de haber aplicado la
-- migración que lo crea. Las dos copias son `IF NOT EXISTS`, así que la segunda
-- no hace nada.

CREATE SCHEMA IF NOT EXISTS sistema;

CREATE TABLE IF NOT EXISTS sistema.migraciones (
  archivo     TEXT PRIMARY KEY,
  -- `md5` del archivo tal como se aplicó. Sirve para contestar «¿este archivo
  -- cambió después de aplicarse?», que es exactamente lo que pasó con la 016
  -- cuando le arreglé un bug: estaba aplicada a medias y el archivo ya no era
  -- el que se había aplicado.
  huella      TEXT NOT NULL,
  aplicada_el TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- `true` cuando la fila se escribió sin correr el archivo, porque la base ya
  -- tenía esa migración de antes (ver `--adoptar` en el script). Queda anotado
  -- porque «la apliqué yo» y «asumí que estaba» no son lo mismo, y el día que
  -- algo no cierre hay que poder distinguirlas.
  adoptada    BOOLEAN NOT NULL DEFAULT false
);

-- Nadie de la API entra acá. El esquema no está expuesto, pero los permisos no
-- se dejan a que eso siga siendo cierto.
REVOKE ALL ON SCHEMA sistema FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA sistema FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA sistema FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA sistema FROM anon, authenticated;
  END IF;
END $$;
