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
# Los roles, el esquema `auth` y los permisos que Supabase le da por defecto a
# `anon` y `authenticated` sobre `public`. Lo último importa: una migración los
# revoca, y si acá no estuvieran el revoke pasaría sin hacer nada y el test
# diría que todo está cerrado cuando en Supabase estaría abierto.
$PSQL -d alojaos -q <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT);
-- En Supabase sale del JWT; acá se simula con una variable de sesión, que es
-- lo que permite probar las policies haciéndose pasar por un dueño.
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
SQL

echo "→ aplicando migraciones"
for f in "$RAIZ"/supabase/migrations/*.sql; do
  printf '   %-26s' "$(basename "$f")"
  $PSQL -d alojaos -q -f "$f" && echo "✓"
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
echo "✓ todo bien"
