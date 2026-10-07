/**
 * Aplica las migraciones de `supabase/migrations` contra el proyecto configurado.
 *
 *   npx tsx scripts/migrate.ts
 *
 * Usa la Management API de Supabase, así que no hace falta el CLI ni acceso
 * directo a Postgres. Se corren en orden alfabético y se para en la primera que
 * falla: media migración aplicada es peor que ninguna.
 *
 * Alternativa a mano: pegar cada archivo en el SQL Editor del dashboard, en
 * orden numérico.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

if (!TOKEN || !REF) {
  console.error(
    '\n✗ Faltan variables de entorno.\n' +
      '  SUPABASE_ACCESS_TOKEN: token personal de https://supabase.com/dashboard/account/tokens\n' +
      '  SUPABASE_PROJECT_REF: el identificador del proyecto (está en la URL del dashboard)\n\n' +
      '  Si preferís no usar un token, pegá los archivos de supabase/migrations\n' +
      '  en el SQL Editor del dashboard, en orden.\n'
  );
  process.exit(1);
}

const DIR = join(process.cwd(), 'supabase', 'migrations');

async function run() {
  const archivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

  if (archivos.length === 0) {
    console.error('✗ No hay migraciones en supabase/migrations');
    process.exit(1);
  }

  for (const archivo of archivos) {
    process.stdout.write(`→ ${archivo} … `);

    const query = readFileSync(join(DIR, archivo), 'utf8');
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      console.log('✗');
      console.error(`\n  ${await res.text()}\n`);
      process.exit(1);
    }

    console.log('✓');
  }

  console.log('\n✓ Migraciones aplicadas. Conviene correr `npm run aislamiento` ahora.\n');
}

run().catch((e) => {
  console.error('\n✗ Error inesperado:', e);
  process.exit(1);
});
