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

import { readFileSync, writeFileSync } from 'node:fs';
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
// El segundo dueño existe para una sola cosa, y es la más importante del
// producto: comprobar que no ve nada del primero. Un sistema multi-inquilino
// que no se prueba con dos inquilinos no está probado.
const MAIL_VECINO = process.env.ALOJAOS_DEMO_EMAIL_VECINO ?? 'vecino@ejemplo.test';

/**
 * Dónde quedan las contraseñas.
 *
 * En un archivo y no sólo impresas en pantalla: las baterías las necesitan, y
 * la alternativa es que quien corre las pruebas copie dos contraseñas a mano
 * cada vez. Está en .gitignore —el patrón `.alojaos-demo*`— y son credenciales
 * de un complejo inventado en un proyecto de prueba, no de nadie.
 */
const ARCHIVO_CLAVES = '.alojaos-demo.json';

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
async function usuario(
  mail: string,
  nombre: string
): Promise<{ id: string; clave: string | null }> {
  const clave = randomBytes(18).toString('base64url');

  const alta = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({
      email: mail,
      password: clave,
      email_confirm: true,
      user_metadata: { nombre },
    }),
  });

  if (alta.ok) {
    const { id } = (await alta.json()) as { id: string };
    console.log(`→ creado: ${mail}`);
    return { id, clave };
  }

  const error = await alta.text();
  if (!/email_exists|already been registered|already exists/i.test(error)) {
    throw new Error(`no pude crear ${mail}: HTTP ${alta.status} ${error.slice(0, 300)}`);
  }

  // Ya estaba. Se lo busca por mail, y se le pone una contraseña nueva: la
  // anterior se imprimió una sola vez y puede no estar en ningún lado. Es un
  // usuario de un complejo inventado; rotarle la contraseña no le rompe nada a
  // nadie, y deja la siembra idempotente de verdad en vez de a medias.
  const lista = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: cabeceras,
  });
  if (!lista.ok) throw new Error(`no pude listar los usuarios: HTTP ${lista.status}`);
  const { users } = (await lista.json()) as { users: Array<{ id: string; email: string }> };
  const ya = users.find((u) => u.email?.toLowerCase() === mail.toLowerCase());
  if (!ya) throw new Error(`el alta dijo que ${mail} ya existe, pero no lo encuentro`);

  const cambio = await fetch(`${URL_BASE}/auth/v1/admin/users/${ya.id}`, {
    method: 'PUT',
    headers: cabeceras,
    body: JSON.stringify({ password: clave }),
  });
  if (!cambio.ok) {
    console.log(`→ ya estaba: ${mail} (no pude rotarle la contraseña: HTTP ${cambio.status})`);
    return { id: ya.id, clave: null };
  }

  console.log(`→ ya estaba: ${mail} (contraseña nueva)`);
  return { id: ya.id, clave };
}

async function main() {
  console.log(`\nSembrando en ${URL_BASE}\n`);

  const duenio = await usuario(MAIL_DUENIO, 'Dueño de ejemplo');
  const vecino = await usuario(MAIL_VECINO, 'Dueño del complejo vecino');

  const claves = {
    url: URL_BASE,
    duenio: { email: MAIL_DUENIO, id: duenio.id, clave: duenio.clave },
    vecino: { email: MAIL_VECINO, id: vecino.id, clave: vecino.clave },
  };

  writeFileSync(ARCHIVO_CLAVES, JSON.stringify(claves, null, 2) + '\n', { mode: 0o600 });

  console.log(`\n→ las contraseñas quedaron en ${ARCHIVO_CLAVES} (0600, ignorado por git)`);
  console.log(`   dueño:  ${MAIL_DUENIO}  ${duenio.clave ?? '(la de antes)'}`);
  console.log(`   vecino: ${MAIL_VECINO}  ${vecino.clave ?? '(la de antes)'}`);
  console.log(
    `\nEl SQL del complejo (unidades, precios, calendario) está en scripts/ejemplo.sql.\n` +
      `Corrélo con el id del dueño puesto en el ajuste:\n\n` +
      `   SET alojaos.duenio = '${duenio.id}';\n` +
      `   \\i scripts/ejemplo.sql\n\n` +
      `Y el complejo vecino, para probar el aislamiento, con scripts/ejemplo-vecino.sql\n` +
      `y SET alojaos.vecino = '${vecino.id}';\n`
  );
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : e);
  process.exit(1);
});
