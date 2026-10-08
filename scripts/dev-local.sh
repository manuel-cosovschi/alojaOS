#!/usr/bin/env bash
#
# Levanta el producto entero contra una base local, sin Supabase.
#
#   ./scripts/dev-local.sh
#
# Qué levanta:
#   - Postgres con las migraciones aplicadas y un complejo de ejemplo cargado,
#   - PostgREST, que es la misma capa REST que usa Supabase, con los roles
#     `anon` y `authenticated`,
#   - un proxy mínimo que traduce `/rest/v1/...` a PostgREST, porque es la ruta
#     que arma el cliente de Supabase,
#   - y escribe `.env.local` apuntando ahí.
#
# Para qué: un build que compila no es una función que anda. Sin esto, la única
# forma de probar la página de reservas es contra un proyecto de Supabase de
# verdad, y entonces no se prueba hasta que haya uno. Con esto se prueba el
# camino completo —el navegador pide, PostgREST ejecuta, la base decide— en una
# máquina cualquiera y sin tocar la cuenta de nadie.
#
# Lo que NO cubre: Auth. El panel del dueño necesita sesiones de verdad y eso lo
# da Supabase. Esto sirve para todo lo público, que es lo que ve el huésped.
#
# Necesita Postgres 16+ con btree_gist. PostgREST se baja solo si no está.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRABAJO="${ALOJAOS_DEV_DIR:-/tmp/alojaos-dev}"
PUERTO_PGRST=3001
PUERTO_REST=3002

# El secreto del JWT es local y de usar y tirar; no es un secreto de producción.
JWT_SECRET="secreto-de-desarrollo-local-con-al-menos-32-caracteres"

BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$BIN/initdb" ] || { echo "✗ No encontré initdb. Instalá Postgres o exportá PG_BIN."; exit 1; }
export PATH="$BIN:$PATH"

# --- PostgREST -------------------------------------------------------------
PGRST="${POSTGREST_BIN:-$(command -v postgrest || true)}"
if [ -z "$PGRST" ]; then
  echo "→ bajando PostgREST"
  mkdir -p "$TRABAJO/bin"
  curl -sSL -o "$TRABAJO/pgrst.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz"
  tar -xJf "$TRABAJO/pgrst.tar.xz" -C "$TRABAJO/bin"
  PGRST="$TRABAJO/bin/postgrest"
fi

limpiar() {
  [ -n "${PID_REST:-}" ] && kill "$PID_REST" 2>/dev/null || true
  [ -n "${PID_PGRST:-}" ] && kill "$PID_PGRST" 2>/dev/null || true
  pg_ctl -D "$TRABAJO/data" stop -m immediate >/dev/null 2>&1 || true
}
trap limpiar EXIT

rm -rf "$TRABAJO/data" "$TRABAJO/run"
mkdir -p "$TRABAJO/data" "$TRABAJO/run"

echo "→ Postgres"
initdb -D "$TRABAJO/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$TRABAJO/data" -o "-k $TRABAJO/run -c listen_addresses=127.0.0.1 -p 5433" \
  -l "$TRABAJO/pg.log" start >/dev/null
PSQL="psql -h 127.0.0.1 -p 5433 -U postgres -v ON_ERROR_STOP=1"
createdb -h 127.0.0.1 -p 5433 -U postgres alojaos >/dev/null

# Lo que Supabase ya trae: los roles, el esquema `auth` y el usuario con el que
# PostgREST se conecta y después cambia de rol según el token.
$PSQL -d alojaos -q <<SQL
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'authenticator';
GRANT anon, authenticated, service_role TO authenticator;

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
LANGUAGE plpgsql IMMUTABLE AS \$fn\$
DECLARE partes TEXT[];
BEGIN
  partes := string_to_array(name, '/');
  RETURN partes[1 : array_length(partes, 1) - 1];
END;
\$fn\$;
-- En Supabase sale del JWT. PostgREST deja los claims en request.jwt.claims.
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS \$\$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
\$\$;
SQL

echo "→ migraciones"
for f in "$RAIZ"/supabase/migrations/*.sql; do
  printf '   %-34s' "$(basename "$f")"
  # Sin el `if`, esto estaba mintiendo. `set -e` NO aborta por el comando de la
  # izquierda de un `&&`, así que con `$PSQL ... && echo "✓"` una migración que
  # fallaba imprimía su error y el script seguía a las pruebas como si nada —
  # que es exactamente la forma de error que este proyecto trata de evitar, en
  # la herramienta que existe para detectarla. Pasó de verdad con la 011.
  if ! $PSQL -d alojaos -f "$f" > "$TRABAJO/migracion.log" 2>&1; then
    echo "✗"
    echo
    echo "   La migración falló. Nada de lo que siga sirve, así que no sigo:"
    sed 's/^/   /' "$TRABAJO/migracion.log"
    exit 1
  fi
  echo "✓"
done

echo "→ complejo de ejemplo"
$PSQL -d alojaos -q -f "$RAIZ/scripts/ejemplo.sql"

# --- PostgREST -------------------------------------------------------------
cat > "$TRABAJO/pgrst.conf" <<CONF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:5433/alojaos"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = $PUERTO_PGRST
CONF

echo "→ PostgREST en :$PUERTO_PGRST"
"$PGRST" "$TRABAJO/pgrst.conf" > "$TRABAJO/pgrst.log" 2>&1 &
PID_PGRST=$!

# --- El proxy que traduce /rest/v1 ----------------------------------------
# El cliente de Supabase arma `<url>/rest/v1/rpc/<funcion>`, y PostgREST sirve
# en la raíz. Veinte líneas de proxy evitan tener que modificar el cliente, que
# es lo último que conviene tocar para una prueba local.
cat > "$TRABAJO/proxy.py" <<'PY'
import http.server, os, urllib.request, urllib.error

DESTINO = f"http://127.0.0.1:{os.environ['PUERTO_PGRST']}"
PREFIJO = "/rest/v1"

class Proxy(http.server.BaseHTTPRequestHandler):
    def _pasar(self):
        ruta = self.path[len(PREFIJO):] if self.path.startswith(PREFIJO) else self.path
        largo = int(self.headers.get("Content-Length") or 0)
        cuerpo = self.rfile.read(largo) if largo else None

        cabeceras = {k: v for k, v in self.headers.items()
                     if k.lower() not in ("host", "content-length", "connection")}
        pedido = urllib.request.Request(DESTINO + ruta, data=cuerpo,
                                        headers=cabeceras, method=self.command)
        try:
            with urllib.request.urlopen(pedido) as r:
                datos, codigo, cab = r.read(), r.status, r.headers
        except urllib.error.HTTPError as e:
            datos, codigo, cab = e.read(), e.code, e.headers

        self.send_response(codigo)
        for k, v in cab.items():
            if k.lower() not in ("transfer-encoding", "connection", "content-length"):
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    do_GET = do_POST = do_PATCH = do_DELETE = do_PUT = _pasar
    def log_message(self, *a):
        pass

http.server.ThreadingHTTPServer(("127.0.0.1", int(os.environ["PUERTO_REST"])), Proxy).serve_forever()
PY

echo "→ proxy REST en :$PUERTO_REST"
PUERTO_PGRST=$PUERTO_PGRST PUERTO_REST=$PUERTO_REST python3 -I "$TRABAJO/proxy.py" &
PID_REST=$!

# --- La clave anónima ------------------------------------------------------
# En Supabase la `anon key` es un JWT con `role: anon` firmado con el secreto
# del proyecto. Se arma igual acá para que el cliente de Supabase no note la
# diferencia.
ANON_KEY=$(JWT_SECRET="$JWT_SECRET" python3 -I - <<'PY'
import base64, hashlib, hmac, json, os

def b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b'=')

cabecera = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode())
cuerpo = b64(json.dumps({"role": "anon", "iss": "alojaos-dev", "exp": 4102444800},
                        separators=(',', ':')).encode())
firma = b64(hmac.new(os.environ["JWT_SECRET"].encode(), cabecera + b'.' + cuerpo, hashlib.sha256).digest())
print((cabecera + b'.' + cuerpo + b'.' + firma).decode())
PY
)

cat > "$RAIZ/.env.local" <<ENV
# Escrito por scripts/dev-local.sh. No es configuración de producción.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$PUERTO_REST
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
NEXT_PUBLIC_SITE_URL=http://alojaos.test:3000
ENV

sleep 2
echo
echo "✓ todo arriba"
echo
echo "  La página de un complejo:   http://cabanias-del-sol.alojaos.test:3000"
echo "  (hace falta que *.alojaos.test resuelva a 127.0.0.1)"
echo
echo "  npm run dev   en otra terminal"
echo
echo "  Ctrl-C acá apaga la base, PostgREST y el proxy."

wait $PID_PGRST
