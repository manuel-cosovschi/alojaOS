/**
 * Una copia de toda la base, en un archivo.
 *
 *   npm run respaldo                      # a ./respaldos/
 *   npm run respaldo -- /otra/carpeta
 *
 * ==================================================================
 * Por qué existe esto
 * ==================================================================
 * La auditoría del 15/10 preguntó qué pasa si la base se pierde, y la API de
 * Supabase contestó:
 *
 *     { "pitr_enabled": false, "backups": [] }
 *
 * Ninguna copia restaurable listada y recuperación a un punto en el tiempo
 * apagada. `npm run alta` ya crea clientes de verdad: el día que haya tres
 * complejos adentro, la base tiene las reservas, los datos de los huéspedes y
 * los datos bancarios de tres negocios. Una migración mal aplicada, un `DELETE`
 * sin `WHERE` o una cuenta comprometida son irreversibles.
 *
 * Esto no reemplaza a PITR —no recupera «el estado de las 14:32»— pero
 * convierte «no hay nada» en «hay lo del último respaldo», que es la diferencia
 * entre un susto y el final del producto.
 *
 * ==================================================================
 * Qué guarda, y qué NO
 * ==================================================================
 * Guarda **los datos**: las once tablas de `public`, enteras, en JSON.
 *
 * NO guarda el esquema, porque el esquema ya está versionado en
 * `supabase/migrations/` y restaurarlo es correr las migraciones contra una
 * base vacía. Tampoco guarda los archivos del bucket de comprobantes: esos son
 * imágenes que el huésped ya mandó y el dueño ya miró, y meterlos acá
 * multiplicaría por cien el tamaño del archivo. Está anotado como lo que falta,
 * y no disfrazado de lo que hay.
 *
 * ==================================================================
 * Esto tiene adentro datos de personas
 * ==================================================================
 * Nombres, DNI, teléfonos, mails y los datos bancarios de cada complejo. El
 * archivo se escribe con permisos 600 y la carpeta está en `.gitignore`.
 * Guardalo como guardarías la base, porque es la base.
 */

import { mkdirSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

/**
 * Las tablas que se copian.
 *
 * Escritas a mano y no leídas del catálogo, a propósito: si alguien agrega una
 * tabla y se olvida de agregarla acá, la comprobación de abajo falla y lo dice.
 * Un respaldo que se adapta solo es un respaldo que calla cuando se olvida algo.
 */
const TABLAS = [
  'complejos',
  'complejo_miembros',
  'unidades',
  'reservas',
  'periodos_precio',
  'precios_unidad',
  'minimos_noches',
  'bloques_fijos',
  'config_calendario',
  'objetivos_temporada',
  'avisos',
  // Las demos de los visitantes. Se copian para que el respaldo sea la base
  // entera; restaurarlas no hace falta, pero un respaldo que elige qué copiar
  // es uno que algún día se olvida de algo que sí hacía falta.
  'demos',
  // Las consultas de /conv: la única copia de quién pidió que le escriban.
  'consultas',
] as const;

if (!TOKEN || !REF) {
  console.error(
    '\n✗ Faltan SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF en .env.local.\n'
  );
  process.exit(1);
}

async function consultar<T = unknown>(sql: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`la base contestó HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

async function main() {
  const destino = process.argv[2] || join(process.cwd(), 'respaldos');
  mkdirSync(destino, { recursive: true });

  // ------------------------------------------------------------------
  // Que la lista de arriba sea la lista de verdad
  // ------------------------------------------------------------------
  const enLaBase = (
    await consultar<Array<{ tabla: string }>>(
      "SELECT c.relname AS tabla FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
        "WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1"
    )
  ).map((f) => f.tabla);

  const sinCopiar = enLaBase.filter((t) => !(TABLAS as readonly string[]).includes(t));
  if (sinCopiar.length > 0) {
    console.error(
      `\n✗ Hay ${sinCopiar.length} tabla(s) en la base que este respaldo NO copia: ${sinCopiar.join(', ')}.\n` +
        '  Agregalas a TABLAS en scripts/respaldo.mts. No escribo un respaldo incompleto\n' +
        '  que parezca completo.\n'
    );
    process.exit(1);
  }

  const copia: Record<string, unknown[]> = {};
  let filas = 0;

  for (const tabla of TABLAS) {
    const datos = await consultar<unknown[]>(`SELECT * FROM public.${tabla};`);
    copia[tabla] = datos;
    filas += datos.length;
    console.log(`  ${String(datos.length).padStart(6)}  ${tabla}`);
  }

  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivo = join(destino, `alojaos-${sello}.json`);

  writeFileSync(
    archivo,
    JSON.stringify(
      {
        hecho_el: new Date().toISOString(),
        proyecto: REF,
        // Hasta qué migración llega el esquema de estos datos. Sin esto, un
        // respaldo viejo se restaura contra un esquema nuevo y nadie se entera
        // hasta que algo no encaja.
        migraciones: await consultar(
          'SELECT archivo, aplicada_el, adoptada FROM sistema.migraciones ORDER BY archivo;'
        ),
        advertencia:
          'Tiene datos de personas: nombres, DNI, teléfonos, mails y los datos bancarios de cada complejo. ' +
          'No incluye los archivos del bucket de comprobantes ni el esquema (ese está en supabase/migrations).',
        tablas: copia,
      },
      null,
      2
    )
  );
  chmodSync(archivo, 0o600);

  const mb = (statSync(archivo).size / 1024 / 1024).toFixed(2);
  console.log(`\n✓ ${filas} filas de ${TABLAS.length} tablas → ${archivo} (${mb} MB, permisos 600)\n`);
}

main().catch((e) => {
  console.error('\n✗ el respaldo se cortó:', e instanceof Error ? e.message : e);
  process.exit(1);
});
