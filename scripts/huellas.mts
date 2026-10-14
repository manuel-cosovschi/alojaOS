/**
 * Las huellas de las funciones del proyecto, para comparar con el repo.
 *
 *   npm run huellas                               > /tmp/produccion.txt
 *   su pgtest -c './scripts/prueba-local.sh --huellas' > /tmp/repo.txt
 *   diff /tmp/produccion.txt /tmp/repo.txt
 *
 * Sin diferencias = producción tiene EXACTAMENTE el código del repo.
 *
 * ------------------------------------------------------------------
 * Por qué esto es distinto de `npm run verificar`
 * ------------------------------------------------------------------
 * El verificador comprueba que las cosas EXISTAN y que los permisos sean los
 * que tienen que ser. No comprueba que el CUERPO de una función sea el del
 * repo, y esa diferencia costó caro hoy: cuando una migración se aplica a
 * medias puede quedar en producción la versión anterior de una función. Existe,
 * está concedida, contesta, y hace otra cosa.
 *
 * `md5(prosrc)` es el cuerpo exacto, comentarios incluidos: lo que está entre
 * los `$$` se guarda tal cual. Dos huellas iguales son dos funciones idénticas.
 *
 * Imprime en el MISMO formato que `prueba-local.sh --huellas` —una línea por
 * función, campos separados por dos espacios— para que un `diff` sirva. Las dos
 * salidas corren la misma consulta: `scripts/huellas-de-funciones.sql`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

if (!TOKEN || !REF) {
  console.error(
    '\n✗ Faltan SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF en .env.local.\n\n' +
      '  Sin token: pegar scripts/huellas-de-funciones.sql en el SQL Editor.\n'
  );
  process.exit(1);
}

async function main() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: readFileSync(join(process.cwd(), 'scripts', 'huellas-de-funciones.sql'), 'utf8'),
    }),
  });

  if (!res.ok) {
    console.error(`✗ la base contestó HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
    process.exit(1);
  }

  const filas = (await res.json()) as Array<{
    funcion: string;
    huella: string;
    codigo: string;
    seguridad: string;
    config: string;
  }>;

  // Sin encabezado y sin totales: la salida tiene que poder entrar a un `diff`
  // contra la del arnés sin que nada más la ensucie.
  for (const f of filas) {
    // Las columnas van TODAS y en el orden del SQL. La primera versión se
    // olvidó de `codigo`, así que mi `diff` comparó el md5 del repo contra la
    // palabra «definer» de producción y me dijo que las cuarenta y cinco
    // funciones eran distintas. Dos minutos creyendo que tenía un problema
    // grave que no existía.
    console.log([f.funcion, f.huella, f.codigo, f.seguridad, f.config].join('  '));
  }
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e);
  process.exit(1);
});
