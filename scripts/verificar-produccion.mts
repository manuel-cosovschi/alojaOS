/**
 * Corre `verificar-produccion.sql` contra el proyecto y falla si falta algo.
 *
 *   npm run verificar
 *
 * ------------------------------------------------------------------
 * Para qué, si el SQL ya se podía pegar en el editor
 * ------------------------------------------------------------------
 * Porque «pegalo en el SQL Editor y mirá que no diga FALTA» es un paso que se
 * hace una vez, el día que uno se acuerda. Un comando que sale con código 1 es
 * un paso que se puede correr después de cada despliegue sin pensarlo, y que
 * alguna vez va a ir en un hook.
 *
 * No duplica nada: lee el MISMO archivo `.sql`, que sigue siendo pegable a mano
 * cuando no hay token. Lo único que agrega es leer la última columna y salir
 * mal si alguna dice FALTA, que es lo que hoy hace un humano a ojo sobre
 * ochenta y cinco filas.
 *
 * Usa la Management API, igual que `migrate.ts`, así que necesita
 * SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF. Sin eso, dice cómo pegarlo.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const ARCHIVO = join(process.cwd(), 'scripts', 'verificar-produccion.sql');

if (!TOKEN || !REF) {
  console.error(
    '\n✗ Faltan SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF en .env.local.\n\n' +
      '  Sin token, el mismo archivo se pega a mano:\n' +
      '  Supabase → SQL Editor → pegar scripts/verificar-produccion.sql → Run.\n' +
      '  Tienen que dar todas `ok` en la última columna.\n'
  );
  process.exit(1);
}

interface Fila {
  orden: number;
  resultado: string;
  [k: string]: unknown;
}

async function main() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: readFileSync(ARCHIVO, 'utf8') }),
  });

  if (!res.ok) {
    console.error(`\n✗ la base contestó HTTP ${res.status}:\n  ${(await res.text()).slice(0, 500)}\n`);
    process.exit(1);
  }

  const filas = (await res.json()) as Fila[];
  if (!Array.isArray(filas) || filas.length === 0) {
    // Cero filas no es «todo bien»: es que la consulta no devolvió lo que
    // devuelve el verificador, y no se sabe nada de la base.
    console.error('\n✗ el verificador no devolvió ninguna fila. Algo cambió en el archivo.\n');
    process.exit(1);
  }

  // La columna del enunciado es la larga; el nombre lo pone el propio SQL, así
  // que se busca en vez de hardcodearlo.
  const columna = Object.keys(filas[0]).find((k) => k !== 'orden' && k !== 'resultado') ?? '';

  const faltan = filas.filter((f) => f.resultado !== 'ok');

  for (const f of faltan) {
    console.log(`FALTA  ${String(f.orden).padStart(3)}  ${f[columna]}`);
  }

  console.log(
    faltan.length === 0
      ? `\n✓ las ${filas.length} filas del verificador dan ok contra el proyecto\n`
      : `\n✗ ${faltan.length} de ${filas.length} filas dicen FALTA: la base de producción no es la del repo\n`
  );
  process.exit(faltan.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ Error inesperado:', e instanceof Error ? e.message : e);
  process.exit(1);
});
