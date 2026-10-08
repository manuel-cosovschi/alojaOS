#!/usr/bin/env bash
#
# ¿El panel avisa cuando la clave de servicio no sirve?
#
#   ./scripts/prueba-clave-rota.sh
#
# Una clave de servicio revocada rompe la subida del comprobante. El huésped lo
# ve —la pantalla le dice que no se pudo guardar— pero **el dueño no**: para él
# simplemente no llegan comprobantes, que es indistinguible de que los huéspedes
# no transfieran. Es el bug del sistema anterior con otra causa, y lo reproduce
# entero cualquiera que rote credenciales.
#
# Por eso el panel tiene un cartel. Y por eso hay que probarlo: con la clave
# buena ese cartel NUNCA aparece, así que un cartel que nadie vio nunca es un
# cartel que capaz no funciona. Acá se levanta el sitio en otro puerto con una
# clave inventada, se entra al panel, y se mira.
#
# No toca nada de nadie: la clave inventada no existe en ningún proyecto, y el
# `.env.local` se restaura al salir incluso si algo falla en el medio.
#
# Necesita el sitio construido (`npm run build`) y el complejo de ejemplo
# sembrado, igual que `npm run prueba:panel`.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f .alojaos-demo.json ] || {
  echo "✗ Falta .alojaos-demo.json. Corré primero: npx tsx scripts/sembrar-demo.mts"
  exit 1
}
TMP=$(mktemp -d)
PID=""

# Un solo trap, y hace las tres cosas. Antes había dos `trap ... EXIT` y el
# segundo reemplazaba al primero en silencio, así que el directorio temporal
# —con una copia del .env.local adentro— quedaba sin borrar.
limpiar() {
  [ -n "$PID" ] && kill "$PID" 2>/dev/null || true
  [ -f "$TMP/env.bueno" ] && cp "$TMP/env.bueno" .env.local
  rm -rf "$TMP"
}
trap limpiar EXIT

cp .env.local "$TMP/env.bueno"
chmod 600 "$TMP/env.bueno"
grep -v '^SUPABASE_SERVICE_ROLE_KEY=' .env.local > "$TMP/env"
echo 'SUPABASE_SERVICE_ROLE_KEY=sb_secret_esta_clave_no_existe_y_es_a_proposito' >> "$TMP/env"
cp "$TMP/env" .env.local

PUERTO=${ALOJAOS_PUERTO_PRUEBA:-3010}
npx next start -p "$PUERTO" > "$TMP/next.log" 2>&1 &
PID=$!

for i in $(seq 1 12); do
  if curl -s -o /dev/null -H "Host: alojaos.test:$PUERTO" "http://127.0.0.1:$PUERTO/login" --max-time 3; then break; fi
  sleep 2
done

CLAVE=$(python3 -I -c "import json,io;print(json.load(io.open('.alojaos-demo.json'))['duenio']['clave'])")
ALOJAOS_PORT=$PUERTO ALOJAOS_DEMO_CLAVE="$CLAVE" npx tsx - <<'TS'
import { chromium } from 'playwright';
const PUERTO = process.env.ALOJAOS_PORT!;
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP *.alojaos.test 127.0.0.1, MAP alojaos.test 127.0.0.1'] });
const p = await b.newPage();
await p.goto(`http://alojaos.test:${PUERTO}/login`);
await p.getByLabel('Mail').fill('duenio@ejemplo.test');
await p.getByLabel('Contraseña').fill(process.env.ALOJAOS_DEMO_CLAVE!);
await p.getByRole('button', { name: 'Entrar' }).click();
await p.waitForURL(/\/panel/, { timeout: 20000 });
const texto = await p.locator('body').innerText();
const avisa = texto.includes('no podemos guardar comprobantes');
const explica = texto.includes('el almacenamiento la rechaza') || texto.includes('Falta la clave');
console.log(`${avisa ? 'OK   ' : 'FALLA'} con la clave rota, el panel avisa que no puede guardar comprobantes`);
console.log(`${explica ? 'OK   ' : 'FALLA'} y explica por qué`);
await b.close();
process.exit(avisa && explica ? 0 : 1);
TS
