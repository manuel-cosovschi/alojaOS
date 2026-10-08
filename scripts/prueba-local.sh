#!/usr/bin/env bash
#
# Corre las migraciones y `prueba-base.sql` contra un Postgres de verdad,
# levantado al momento y tirado al final.
#
#   ./scripts/prueba-local.sh
#
# Para qué: las reglas que importan de este producto viven en la base —la
# restricción que impide dos reservas sobre la misma noche, las policies, los
# permisos— y ninguna se puede comprobar con tests de TypeScript. Un build que
# compila no es una función que anda.
#
# Contra un Postgres local y no contra el proyecto de Supabase porque así se
# puede correr en cada cambio sin tocar nada de nadie, y porque permite probar
# cosas que en Supabase no se pueden provocar a mano, como dos escrituras
# simultáneas sobre la misma noche.
#
# Necesita Postgres 16 o superior con `btree_gist` (viene en postgresql-contrib).
# En Debian/Ubuntu: apt install postgresql postgresql-contrib

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$BIN/initdb" ] || { echo "✗ No encontré initdb. Instalá Postgres o exportá PG_BIN."; exit 1; }
export PATH="$BIN:$PATH"

TMP="$(mktemp -d)"
limpiar() {
  pg_ctl -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpiar EXIT

echo "→ levantando Postgres en $TMP"
initdb -D "$TMP/data" -U postgres --auth=trust >/dev/null
mkdir -p "$TMP/run"
pg_ctl -D "$TMP/data" -o "-k $TMP/run -c listen_addresses=''" -l "$TMP/log" start >/dev/null
PSQL="psql -h $TMP/run -U postgres -v ON_ERROR_STOP=1"

createdb -h "$TMP/run" -U postgres alojaos >/dev/null

# ---------------------------------------------------------------------------
# Lo que Supabase ya trae
# ---------------------------------------------------------------------------
# Los roles, el esquema `auth` y los permisos que Supabase le da por defecto
# sobre `public`. Esto último importa, y ya falló una vez: reproducir mal el
# entorno es peor que no probarlo, porque da una respuesta tranquilizadora y
# falsa. Faltaba la línea de FUNCIONES, así que una migración que revocaba
# EXECUTE "de PUBLIC" pasaba la prueba local mientras en Supabase cada función
# seguía concedida a `anon` por un permiso explícito, que es de donde viene.
$PSQL -d alojaos -q <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT);

-- El esquema de almacenamiento, en lo mínimo que las migraciones tocan: el
-- registro de buckets, la tabla de objetos con RLS, y `foldername`, que es la
-- que convierte una ruta en los tramos de los que sale el permiso.
--
-- Esto NO reproduce el almacenamiento de Supabase: no sube ni sirve archivos.
-- Alcanza para que las migraciones se apliquen y para comprobar que las policies
-- queden escritas como dicen. Que un archivo llegue de verdad lo prueba la
-- batería de navegador contra un proyecto real.
CREATE ROLE supabase_storage_admin NOLOGIN;
CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (
  id TEXT PRIMARY KEY, name TEXT, public BOOLEAN DEFAULT false,
  file_size_limit BIGINT, allowed_mime_types TEXT[]
);
CREATE TABLE storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT, owner UUID, created_at TIMESTAMPTZ DEFAULT now()
);
-- De `supabase_storage_admin`, como en el proyecto de verdad, y el rol que
-- corre las migraciones NO es miembro de ese rol. Por eso allá el CREATE POLICY
-- sobre esta tabla no entra, y por eso acá tampoco tiene que entrar: una base
-- local más permisiva que la de producción contesta que todo anda y no es
-- cierto. La prueba que lo vigila está en el bloque 13 de prueba-base.sql.
ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
-- Los GRANT puestos y RLS prendido: igual que Supabase. Los permisos de tabla
-- están, y lo que decide es RLS. Sin policies, no pasa nadie.
GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Igual que en Supabase: los tramos de carpeta de una ruta, sin el archivo.
CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[]
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE partes TEXT[];
BEGIN
  partes := string_to_array(name, '/');
  RETURN partes[1 : array_length(partes, 1) - 1];
END;
$fn$;
-- En Supabase sale del JWT; acá se simula con una variable de sesión, que es
-- lo que permite probar las policies haciéndose pasar por un dueño.
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
SQL

echo "→ aplicando migraciones"
for f in "$RAIZ"/supabase/migrations/*.sql; do
  printf '   %-26s' "$(basename "$f")"
  # Sin el `if`, esto estaba mintiendo. `set -e` NO aborta por el comando de la
  # izquierda de un `&&`, así que con `$PSQL ... && echo "✓"` una migración que
  # fallaba imprimía su error y el script seguía a las pruebas como si nada —
  # que es exactamente la forma de error que este proyecto trata de evitar, en
  # la herramienta que existe para detectarla. Pasó de verdad con la 011.
  if ! $PSQL -d alojaos -f "$f" > "$TMP/migracion.log" 2>&1; then
    echo "✗"
    echo
    echo "   La migración falló. Nada de lo que siga sirve, así que no sigo:"
    sed 's/^/   /' "$TMP/migracion.log"
    exit 1
  fi
  echo "✓"
done

echo
echo "→ pruebas de la base"
$PSQL -d alojaos -f "$RAIZ/scripts/prueba-base.sql"

# ---------------------------------------------------------------------------
# Dos reservas al mismo tiempo sobre la misma noche
# ---------------------------------------------------------------------------
# Esto es lo que el sistema anterior no podía resolver, porque miraba la
# planilla y después escribía: entre mirar y escribir entra otro. No se puede
# probar dentro de `prueba-base.sql` porque hacen falta dos sesiones de verdad.
echo
echo "→ dos escrituras simultáneas sobre la misma noche"

$PSQL -d alojaos -q <<'SQL'
INSERT INTO complejos (id, slug, nombre, reservas_habilitadas)
VALUES ('cccccccc-0000-0000-0000-00000000000c','carrera','Complejo Carrera', true);
INSERT INTO unidades (id, complejo_id, codigo, nombre, capacidad_maxima)
VALUES ('dddddddd-0000-0000-0000-00000000000d','cccccccc-0000-0000-0000-00000000000c','X1','Unidad X',4);
INSERT INTO config_calendario (complejo_id, ultima_fecha, minimo_noches)
VALUES ('cccccccc-0000-0000-0000-00000000000c','2027-12-31',1);
WITH p AS (
  INSERT INTO periodos_precio (complejo_id, desde, hasta)
  VALUES ('cccccccc-0000-0000-0000-00000000000c','2027-01-01','2027-12-31') RETURNING id
) INSERT INTO precios_unidad (periodo_id, unidad_id, precio)
  SELECT id,'dddddddd-0000-0000-0000-00000000000d',100000 FROM p;
SQL

# La sesión A escribe del 10 al 17 y se queda tres segundos sin cerrar.
psql -h "$TMP/run" -U postgres -d alojaos -q >/dev/null 2>&1 <<'SQL' &
BEGIN;
INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
VALUES ('cccccccc-0000-0000-0000-00000000000c','dddddddd-0000-0000-0000-00000000000d',
        '2027-01-10','2027-01-17','CONFIRMED','web','Primero');
SELECT pg_sleep(3);
COMMIT;
SQL
A_PID=$!
sleep 1

# La sesión B entra en el medio y pide noches de adentro de ese rango.
RES=$(psql -h "$TMP/run" -U postgres -d alojaos -t -A -c \
  "SELECT public.crear_reserva('carrera','dddddddd-0000-0000-0000-00000000000d',
     '2027-01-12','2027-01-15',2::smallint,'Segundo','1','b@ejemplo.test','549');" 2>&1)
wait $A_PID

CUANTAS=$(psql -h "$TMP/run" -U postgres -d alojaos -t -A -c \
  "SELECT count(*) FROM reservas WHERE unidad_id='dddddddd-0000-0000-0000-00000000000d';")

echo "   el segundo recibió: $RES"
if [[ "$RES" == *'"motivo": "ocupada"'* ]] && [ "$CUANTAS" = "1" ]; then
  echo "   OK    sólo quedó una reserva, y el segundo recibió un mensaje y no un error"
else
  echo "   FALLA quedaron $CUANTAS reservas sobre la misma unidad"
  exit 1
fi

echo

# ---------------------------------------------------------------------------
# El verificador de producción, corrido contra esta base
# ---------------------------------------------------------------------------
# `verificar-produccion.sql` se pega en el editor SQL del proyecto de Supabase
# para contestar si la base de allá es la que dice el repo. Corriéndolo acá se
# comprueba otra cosa, y hace falta: que el verificador mismo ande. Un
# verificador con un error de sintaxis o con una firma de función mal escrita
# contesta FALTA sobre algo que está, y eso manda a arreglar lo que no está roto.
#
# Acá, con todas las migraciones aplicadas, tiene que decir `ok` en todo.
echo "→ el verificador de producción, contra esta base (tiene que dar todo ok)"
VERIF="$TMP/verificacion.txt"
if ! $PSQL -d alojaos -f "$RAIZ/scripts/verificar-produccion.sql" > "$VERIF" 2>&1; then
  echo "   ✗ el verificador no corre:"
  sed 's/^/   /' "$VERIF"
  exit 1
fi
if grep -q "FALTA" "$VERIF"; then
  echo "   ✗ el verificador dice que falta algo en una base con TODAS las migraciones."
  echo "     O el verificador está mal, o una migración no hace lo que dice:"
  grep -n "FALTA" "$VERIF" | sed 's/^/   /'
  exit 1
fi
echo "   OK    todas las filas del verificador dan ok"

echo "✓ todo bien"
