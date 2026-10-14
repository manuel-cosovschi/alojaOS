/**
 * Aplica las migraciones que falten en el proyecto configurado.
 *
 *   npx tsx scripts/migrate.ts              # aplica las que falten
 *   npx tsx scripts/migrate.ts --ver         # no escribe nada: dice qué haría
 *   npx tsx scripts/migrate.ts --adoptar 015 # anota 001-015 como aplicadas SIN correrlas
 *   npx tsx scripts/migrate.ts --reaplicar 016_precios_desde_el_panel.sql
 *
 * Usa la Management API de Supabase, así que no hace falta el CLI ni acceso
 * directo a Postgres. Y no pasa por el conector MCP, que corta las llamadas con
 * `UPDATE` o `DELETE` sin ejecutar nada (ver `supabase/a_mano/README.md`).
 *
 * ------------------------------------------------------------------
 * Qué cambió, y por qué hacía falta
 * ------------------------------------------------------------------
 * La primera versión corría TODAS las migraciones desde la 001 en cada
 * invocación. Contra un proyecto vacío eso anda; contra uno que ya tiene las
 * primeras quince aplicadas muere en la 002 con «relation reservas already
 * exists» y nunca llega a la que falta.
 *
 * O sea: la herramienta que el repo documentaba como «el camino bueno» para
 * aplicar migraciones servía una sola vez, el primer día.
 *
 * Ahora lleva registro en `sistema.migraciones` (la crea la 019, y este script
 * también, porque tiene que poder leerla antes de haberla aplicado) y corre
 * sólo lo que falta.
 *
 * ------------------------------------------------------------------
 * Las tres cosas que NO hace sola
 * ------------------------------------------------------------------
 * **Adoptar.** Un proyecto que ya tenía migraciones aplicadas antes de que
 * existiera el registro necesita que alguien diga cuáles. Eso es `--adoptar`, y
 * es explícito porque anotar como aplicada una que no está dejaría un agujero
 * silencioso. Lo que verifica que de verdad estén es
 * `scripts/verificar-produccion.sql`, que no se cree el registro: mira el
 * catálogo.
 *
 * **Reaplicar.** Si el archivo cambió después de aplicarse, el script lo dice y
 * se para. No reaplica solo: las 001-015 no son idempotentes y volver a
 * correrlas rompería. Las 016 en adelante son `CREATE OR REPLACE`, así que para
 * esas `--reaplicar` es seguro, pero igual lo pide a mano.
 *
 * **Revertir.** No hay. Una migración que salió mal se arregla con otra
 * migración, que queda en el historial. Un `down` que nadie probó es un botón
 * que destruye datos cuando más nervioso está el que lo aprieta.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

const args = process.argv.slice(2);
const soloVer = args.includes('--ver');
const adoptarHasta = valorDe('--adoptar');
const reaplicar = valorDe('--reaplicar');

function valorDe(bandera: string): string | null {
  const i = args.indexOf(bandera);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

/** El DDL del registro, idempotente. Igual que la 019, a propósito. */
const CREAR_REGISTRO = `
  CREATE SCHEMA IF NOT EXISTS sistema;
  CREATE TABLE IF NOT EXISTS sistema.migraciones (
    archivo     TEXT PRIMARY KEY,
    huella      TEXT NOT NULL,
    aplicada_el TIMESTAMPTZ NOT NULL DEFAULT now(),
    adoptada    BOOLEAN NOT NULL DEFAULT false
  );
`;

/**
 * Una consulta contra el proyecto.
 *
 * Devuelve las filas, o levanta con el cuerpo del error. No reintenta: una
 * migración que falló a medias no se arregla mandándola de nuevo, y reintentar
 * en silencio es cómo se pierde de vista que algo salió mal.
 */
async function consultar<T = unknown>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error(await res.text());

  const cuerpo = await res.text();
  if (!cuerpo) return [];
  try {
    const dato = JSON.parse(cuerpo);
    return Array.isArray(dato) ? (dato as T[]) : [];
  } catch {
    return [];
  }
}

const huellaDe = (texto: string) => createHash('md5').update(texto, 'utf8').digest('hex');

/** Las comillas de una cadena para SQL. Son nombres de archivo y md5, pero igual. */
const sql = (v: string) => `'${v.replace(/'/g, "''")}'`;

async function run() {
  const archivos = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (archivos.length === 0) {
    console.error('✗ No hay migraciones en supabase/migrations');
    process.exit(1);
  }

  // Con `--ver` no se crea el registro. La primera versión lo creaba siempre y
  // después imprimía «no escribí nada», que es una mentira chica —el esquema y
  // la tabla quedaban hechos— y una mentira chica en la herramienta que
  // informa es la que enseña a no creerle.
  if (!soloVer) await consultar(CREAR_REGISTRO);

  const aplicadas = new Map<string, { huella: string; adoptada: boolean }>();
  let hayRegistro = true;
  try {
    for (const f of await consultar<{ archivo: string; huella: string; adoptada: boolean }>(
      'SELECT archivo, huella, adoptada FROM sistema.migraciones'
    )) {
      aplicadas.set(f.archivo, { huella: f.huella, adoptada: f.adoptada });
    }
  } catch (e) {
    // Con `--ver` sobre una base que todavía no tiene el registro, leerlo falla
    // y eso no es un error: es la respuesta.
    if (!soloVer) throw e;
    hayRegistro = false;
    console.log(
      '\n  (el registro de migraciones todavía no existe en esta base;\n' +
        '   lo crea la primera corrida sin --ver)'
    );
  }
  void hayRegistro;

  // ------------------------------------------------------------------
  // --adoptar: anotar sin correr
  // ------------------------------------------------------------------
  if (adoptarHasta !== null) {
    const hasta = archivos.filter((f) => f.split('_')[0] <= adoptarHasta.padStart(3, '0'));
    if (hasta.length === 0) {
      console.error(`✗ Ninguna migración llega hasta «${adoptarHasta}».`);
      process.exit(1);
    }

    console.log(
      `\n→ Voy a anotar ${hasta.length} migraciones como aplicadas SIN correrlas:\n` +
        hasta.map((f) => `    ${f}`).join('\n') +
        '\n\n  Esto NO comprueba que de verdad estén. Lo que lo comprueba es\n' +
        '  scripts/verificar-produccion.sql, que mira el catálogo y no este registro.\n'
    );

    if (soloVer) {
      console.log('  (--ver: no escribí nada)\n');
      return;
    }

    const filas = hasta
      .map((f) => `(${sql(f)}, ${sql(huellaDe(readFileSync(join(DIR, f), 'utf8')))}, true)`)
      .join(', ');
    await consultar(
      `INSERT INTO sistema.migraciones (archivo, huella, adoptada) VALUES ${filas}
         ON CONFLICT (archivo) DO NOTHING`
    );
    console.log(`✓ Anotadas. Ahora \`npx tsx scripts/migrate.ts\` aplica sólo lo que falta.\n`);
    return;
  }

  // ------------------------------------------------------------------
  // --reaplicar: correr una que ya está
  // ------------------------------------------------------------------
  if (reaplicar !== null) {
    if (!archivos.includes(reaplicar)) {
      console.error(`✗ No existe supabase/migrations/${reaplicar}`);
      process.exit(1);
    }
    const texto = readFileSync(join(DIR, reaplicar), 'utf8');
    console.log(`→ reaplicando ${reaplicar} … `);
    if (soloVer) {
      console.log('  (--ver: no escribí nada)\n');
      return;
    }
    await consultar(texto);
    await consultar(
      `INSERT INTO sistema.migraciones (archivo, huella, adoptada)
            VALUES (${sql(reaplicar)}, ${sql(huellaDe(texto))}, false)
       ON CONFLICT (archivo) DO UPDATE
          SET huella = EXCLUDED.huella, aplicada_el = now(), adoptada = false`
    );
    console.log('✓ Reaplicada.\n');
    return;
  }

  // ------------------------------------------------------------------
  // Lo normal: aplicar lo que falte
  // ------------------------------------------------------------------
  const cambiadas: string[] = [];
  const faltan: string[] = [];

  for (const archivo of archivos) {
    const texto = readFileSync(join(DIR, archivo), 'utf8');
    const ya = aplicadas.get(archivo);
    if (!ya) {
      faltan.push(archivo);
    } else if (ya.huella !== huellaDe(texto)) {
      cambiadas.push(archivo);
    }
  }

  // Un archivo que cambió después de aplicarse es la falla silenciosa de todo
  // esto: la base tiene una versión y el repo otra, y nada lo dice. Se avisa
  // siempre, incluso cuando no hay nada que aplicar.
  if (cambiadas.length > 0) {
    console.log(
      `\n⚠ ${cambiadas.length} ${cambiadas.length === 1 ? 'migración' : 'migraciones'} ` +
        `${cambiadas.length === 1 ? 'cambió' : 'cambiaron'} después de aplicarse:\n` +
        cambiadas.map((f) => `    ${f}`).join('\n') +
        '\n\n  La base tiene una versión y el repo otra. Si el archivo es de los que\n' +
        '  usan CREATE OR REPLACE (016 en adelante), se arregla con:\n' +
        cambiadas.map((f) => `    npx tsx scripts/migrate.ts --reaplicar ${f}`).join('\n') +
        '\n'
    );
  }

  if (faltan.length === 0) {
    console.log(
      aplicadas.size === 0
        ? '\n✗ El registro está vacío y no hay nada que aplicar: algo anda mal.\n'
        : `\n✓ Nada que aplicar: las ${archivos.length} migraciones están registradas.\n`
    );
    if (cambiadas.length > 0) process.exit(1);
    return;
  }

  console.log(`\n→ faltan ${faltan.length} de ${archivos.length}:`);
  for (const f of faltan) console.log(`    ${f}`);

  if (soloVer) {
    console.log('\n  (--ver: no escribí nada)\n');
    return;
  }

  console.log('');
  for (const archivo of faltan) {
    process.stdout.write(`→ ${archivo} … `);
    const texto = readFileSync(join(DIR, archivo), 'utf8');

    try {
      await consultar(texto);
    } catch (e) {
      console.log('✗');
      console.error(`\n  ${e instanceof Error ? e.message : String(e)}\n`);
      // Se para acá a propósito: media migración aplicada es peor que ninguna,
      // y seguir con la siguiente dejaría el esquema en un estado que no
      // describe ningún archivo.
      console.error(
        '  Me paré acá. Las anteriores quedaron aplicadas y registradas;\n' +
          '  esta no se registró, así que volver a correr el comando la reintenta.\n'
      );
      process.exit(1);
    }

    await consultar(
      `INSERT INTO sistema.migraciones (archivo, huella, adoptada)
            VALUES (${sql(archivo)}, ${sql(huellaDe(texto))}, false)
       ON CONFLICT (archivo) DO UPDATE
          SET huella = EXCLUDED.huella, aplicada_el = now(), adoptada = false`
    );
    console.log('✓');
  }

  console.log(
    `\n✓ ${faltan.length} aplicadas.\n\n` +
      '  Ahora conviene correr, en este orden:\n' +
      '    scripts/verificar-produccion.sql   (en el SQL Editor; todo tiene que dar ok)\n' +
      '    npm run prueba:panel               (el panel contra la base de verdad)\n' +
      '    npm run aislamiento                (que un complejo no vea al otro)\n'
  );
}

run().catch((e) => {
  console.error('\n✗ Error inesperado:', e);
  process.exit(1);
});
