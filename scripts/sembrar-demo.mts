/**
 * El complejo de ejemplo, cargado en el proyecto de Supabase.
 *
 *   npx tsx scripts/sembrar-demo.mts
 *
 * Para qué: `dev-local.sh` carga `ejemplo.sql` en un Postgres de al lado, y eso
 * alcanza para tocar la página. Lo que NO alcanza para es probar el
 * almacenamiento: PostgREST local no sube archivos. La única forma de saber que
 * un comprobante llega de verdad es subirlo al proyecto de verdad.
 *
 * Qué hace distinto a `ejemplo.sql`:
 *
 *   - El dueño se crea por la API de Auth, no con un INSERT en `auth.users`.
 *     En un proyecto administrado esa tabla es de Supabase: una fila puesta a
 *     mano queda sin las columnas que el servicio de Auth espera, y el usuario
 *     existe para la base y no para el login.
 *   - Es idempotente: si el complejo ya está, lo deja como está y sigue. Un
 *     script de siembra que falla la segunda vez se corre una sola vez y después
 *     nadie sabe en qué estado quedó nada.
 *
 * El complejo es inventado y tiene que seguir siéndolo: `npm run sin-marca`
 * falla si acá apareciera el nombre o el teléfono de un cliente de verdad.
 */

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

for (const linea of readFileSync('.env.local', 'utf-8').split('\n')) {
  const i = linea.indexOf('=');
  if (i > 0 && !linea.startsWith('#')) process.env[linea.slice(0, i)] ??= linea.slice(i + 1);
}

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!URL_BASE || !SERVICIO) {
  console.error(
    '\n✗ Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.\n' +
      '  La clave de servicio hace falta porque sembrar es escribir por encima de RLS.\n'
  );
  process.exit(1);
}

const MAIL_DUENIO = process.env.ALOJAOS_DEMO_EMAIL ?? 'duenio@ejemplo.test';

const cabeceras = {
  apikey: SERVICIO,
  Authorization: `Bearer ${SERVICIO}`,
  'Content-Type': 'application/json',
};

/**
 * El dueño, por la API de Auth.
 *
 * Devuelve su id. Si el usuario ya existe, lo busca en vez de fallar: la API
 * contesta 422 con `email_exists`, que es una respuesta correcta y no un error
 * que haya que mostrar.
 */
async function duenio(): Promise<string> {
  const clave = randomBytes(18).toString('base64url');

  const alta = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({
      email: MAIL_DUENIO,
      password: clave,
      email_confirm: true,
      user_metadata: { nombre: 'Dueño de ejemplo' },
    }),
  });

  if (alta.ok) {
    const { id } = (await alta.json()) as { id: string };
    console.log(`→ dueño creado: ${MAIL_DUENIO}`);
    console.log(`  contraseña (se muestra una sola vez): ${clave}`);
    return id;
  }

  const error = await alta.text();
  if (!/email_exists|already been registered|already exists/i.test(error)) {
    throw new Error(`no pude crear el dueño: HTTP ${alta.status} ${error.slice(0, 300)}`);
  }

  // Ya estaba. Se lo busca por mail.
  const lista = await fetch(
    `${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`,
    { headers: cabeceras }
  );
  if (!lista.ok) throw new Error(`no pude listar los usuarios: HTTP ${lista.status}`);
  const { users } = (await lista.json()) as { users: Array<{ id: string; email: string }> };
  const ya = users.find((u) => u.email?.toLowerCase() === MAIL_DUENIO.toLowerCase());
  if (!ya) throw new Error(`el alta dijo que ${MAIL_DUENIO} ya existe, pero no lo encuentro`);
  console.log(`→ el dueño ya estaba: ${MAIL_DUENIO} (la contraseña es la de antes)`);
  return ya.id;
}

async function main() {
  console.log(`\nSembrando el complejo de ejemplo en ${URL_BASE}\n`);
  const idDuenio = await duenio();
  console.log(`\nEl id del dueño es ${idDuenio}.`);
  console.log(
    '\nEl resto de la siembra (complejo, unidades, precios, calendario) es SQL\n' +
      'y vive en scripts/ejemplo-remoto.sql. Corré ese archivo con el id de\n' +
      'arriba, o pegalo en el SQL Editor reemplazando EL_ID_DEL_DUENIO.\n'
  );
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : e);
  process.exit(1);
});
