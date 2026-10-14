/**
 * Dar de alta un cliente.
 *
 *   npx tsx scripts/alta-de-cliente.mts clientes/mi-complejo.json --ver
 *   npx tsx scripts/alta-de-cliente.mts clientes/mi-complejo.json
 *
 * `--ver` valida el archivo y dice qué haría, sin escribir nada.
 *
 * ------------------------------------------------------------------
 * Por qué un archivo y no argumentos de línea de comandos
 * ------------------------------------------------------------------
 * Un alta tiene como quince datos, entre ellos las unidades, que son una lista.
 * Eso en argumentos es imposible de revisar antes de apretar enter. En un
 * archivo se lee, se corrige, se corre con `--ver`, se corre en serio, y queda
 * en algún lado lo que se cargó.
 *
 * `clientes/` está en .gitignore: son datos de personas reales —nombre,
 * teléfono, CBU— y no van al repo. El ejemplo que sí va es
 * `scripts/ejemplo-alta.json`, con datos inventados.
 *
 * ------------------------------------------------------------------
 * Esto no es una pantalla, y es a propósito
 * ------------------------------------------------------------------
 * Crear un complejo necesita la clave de servicio, que saltea RLS. Hacerlo
 * desde el panel pediría un rol de administrador, y un rol que puede crear
 * complejos es un rol que puede escribir en el complejo de cualquiera. Esa
 * superficie no se agrega para ahorrar un comando que corro yo.
 *
 * Lo que el script hace, y en este orden:
 *
 *   1. crea el usuario del dueño por la API de Auth —no con un INSERT en
 *      `auth.users`, que lo dejaría existiendo para la base y no para el login—;
 *   2. llama a `crear_complejo()`, que hace el complejo, sus unidades, la
 *      configuración del calendario y la membresía en UNA transacción;
 *   3. dice qué le falta al complejo para vender, que después del alta es
 *      siempre algo: los precios.
 *
 * El paso 1 no es transaccional con el 2: si el 2 falla, queda un usuario de
 * Auth sin complejo. Eso es inofensivo —un usuario sin membresía entra al panel
 * y ve «tu cuenta todavía no está asociada a ningún complejo»— y volver a
 * correr el script lo reutiliza en vez de duplicarlo.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

for (const linea of readFileSync('.env.local', 'utf-8').split('\n')) {
  const i = linea.indexOf('=');
  if (i > 0 && !linea.startsWith('#')) process.env[linea.slice(0, i)] ??= linea.slice(i + 1);
}

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const RAIZ = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '';

const args = process.argv.slice(2);
const soloVer = args.includes('--ver');
const archivo = args.find((a) => !a.startsWith('--'));

if (!archivo) {
  console.error(
    '\n✗ Falta el archivo del cliente.\n\n' +
      '    npx tsx scripts/alta-de-cliente.mts clientes/mi-complejo.json --ver\n\n' +
      '  El formato está en scripts/ejemplo-alta.json.\n'
  );
  process.exit(1);
}
if (!existsSync(archivo)) {
  console.error(`\n✗ No existe ${archivo}\n`);
  process.exit(1);
}
if (!URL_BASE || !SERVICIO) {
  console.error(
    '\n✗ Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.\n' +
      '  La clave de servicio hace falta porque dar de alta es escribir por encima de RLS.\n'
  );
  process.exit(1);
}

interface Unidad {
  codigo: string;
  nombre: string;
  capacidad_maxima: number;
  sugerencia_ocupacion?: string;
}

interface Alta {
  slug: string;
  nombre: string;
  mail_del_duenio: string;
  nombre_del_duenio?: string;
  localidad?: string;
  provincia?: string;
  whatsapp?: string;
  email?: string;
  datos_transferencia?: string;
  moneda?: string;
  zona_horaria?: string;
  mes_inicio_temporada?: number;
  porcentaje_sena?: number;
  horas_vencimiento_sena?: number;
  primera_fecha?: string | null;
  ultima_fecha: string;
  minimo_noches?: number;
  unidades: Unidad[];
}

const cabeceras = {
  apikey: SERVICIO,
  Authorization: `Bearer ${SERVICIO}`,
  'Content-Type': 'application/json',
};

/**
 * Valida el archivo antes de tocar nada.
 *
 * `crear_complejo()` valida lo suyo y revierte entero si algo falla, así que
 * esto no es la red de seguridad: es para no gastar un usuario de Auth y una
 * llamada en algo que ya se sabe que está mal, y para decirlo todo junto en vez
 * de un error por corrida.
 */
function problemas(a: Alta): string[] {
  const malos: string[] = [];
  const pedir = (cond: boolean, queja: string) => {
    if (!cond) malos.push(queja);
  };

  pedir(typeof a.slug === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug),
    'slug: en minúsculas, sin acentos ni espacios, con guiones. Ej: "cabanias-del-sol"');
  pedir(typeof a.slug === 'string' && a.slug.length >= 3 && a.slug.length <= 40,
    'slug: entre 3 y 40 caracteres');
  pedir(!!a.nombre?.trim(), 'nombre: el nombre del complejo, como lo ve el huésped');
  pedir(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.mail_del_duenio ?? ''),
    'mail_del_duenio: el mail con el que el dueño va a entrar al panel');
  pedir(/^\d{4}-\d{2}-\d{2}$/.test(a.ultima_fecha ?? ''),
    'ultima_fecha: la última noche reservable, en AAAA-MM-DD');
  pedir(Array.isArray(a.unidades) && a.unidades.length > 0,
    'unidades: al menos una. Un complejo sin unidades no puede vender nada');

  (a.unidades ?? []).forEach((u, i) => {
    pedir(!!u?.codigo?.trim(), `unidades[${i}].codigo: un código corto, ej "C1"`);
    pedir(!!u?.nombre?.trim(), `unidades[${i}].nombre: cómo la ve el huésped`);
    pedir(
      Number.isInteger(u?.capacidad_maxima) && u.capacidad_maxima >= 1 && u.capacidad_maxima <= 50,
      `unidades[${i}].capacidad_maxima: un entero entre 1 y 50`
    );
  });

  const codigos = (a.unidades ?? []).map((u) => u?.codigo?.trim().toUpperCase());
  if (new Set(codigos).size !== codigos.length) {
    malos.push('unidades: hay dos con el mismo código');
  }

  // `ultima_fecha` en el pasado crea un complejo cuyo calendario sale vacío el
  // mismo día del alta. No lo prohíbe la base —el dueño puede querer corregirla
  // en pasos— pero en un alta es siempre un error de tipeo.
  if (/^\d{4}-\d{2}-\d{2}$/.test(a.ultima_fecha ?? '')) {
    const hoy = new Date().toISOString().slice(0, 10);
    if (a.ultima_fecha < hoy) {
      malos.push(`ultima_fecha: ${a.ultima_fecha} ya pasó. El calendario saldría vacío desde el día uno`);
    }
  }

  return malos;
}

/**
 * El usuario del dueño, por la API de Auth.
 *
 * Si ya existe, lo reutiliza y le pone una contraseña nueva: la anterior se
 * imprimió una sola vez y puede no estar en ningún lado. Es la misma lógica que
 * `sembrar-demo.mts`, por el mismo motivo —que correr el script dos veces no
 * deje nada a medias—, pero acá con una diferencia: **no se rota la contraseña
 * de un dueño que ya tiene complejos**. Ese es un cliente andando, y cambiarle
 * la clave porque corrí un script lo deja afuera de su propio panel.
 */
async function usuarioDelDuenio(
  mail: string,
  nombre: string
): Promise<{ id: string; clave: string | null; ya_estaba: boolean }> {
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
    return { id, clave, ya_estaba: false };
  }

  const error = await alta.text();
  if (!/email_exists|already been registered|already exists/i.test(error)) {
    throw new Error(`no pude crear el usuario ${mail}: HTTP ${alta.status} ${error.slice(0, 300)}`);
  }

  const lista = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: cabeceras,
  });
  if (!lista.ok) throw new Error(`no pude listar los usuarios: HTTP ${lista.status}`);
  const { users } = (await lista.json()) as { users: Array<{ id: string; email: string }> };
  const ya = users.find((u) => u.email?.toLowerCase() === mail.toLowerCase());
  if (!ya) throw new Error(`el alta dijo que ${mail} ya existe, pero no lo encuentro`);

  // ¿Tiene complejos? Si los tiene, es un cliente andando y no se le toca la
  // contraseña.
  const miembro = await fetch(
    `${URL_BASE}/rest/v1/complejo_miembros?user_id=eq.${ya.id}&select=complejo_id`,
    { headers: cabeceras }
  );
  const complejos = miembro.ok ? ((await miembro.json()) as unknown[]) : [];
  if (complejos.length > 0) {
    return { id: ya.id, clave: null, ya_estaba: true };
  }

  const cambio = await fetch(`${URL_BASE}/auth/v1/admin/users/${ya.id}`, {
    method: 'PUT',
    headers: cabeceras,
    body: JSON.stringify({ password: clave }),
  });
  return {
    id: ya.id,
    clave: cambio.ok ? clave : null,
    ya_estaba: true,
  };
}

/** La dirección pública, con el mismo criterio que `src/lib/tenant.ts`. */
function direccion(slug: string): string | null {
  if (!RAIZ) return null;
  const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  let protocolo = 'https:';
  let puerto = '';
  try {
    const u = new URL(sitio);
    protocolo = u.protocol;
    puerto = u.port ? `:${u.port}` : '';
  } catch {
    /* sin NEXT_PUBLIC_SITE_URL legible, https y sin puerto */
  }
  return `${protocolo}//${slug}.${RAIZ}${puerto}`;
}

async function main() {
  const alta = JSON.parse(readFileSync(archivo!, 'utf-8')) as Alta;

  const malos = problemas(alta);
  if (malos.length > 0) {
    console.error(`\n✗ ${archivo} tiene ${malos.length} problema(s):\n`);
    for (const m of malos) console.error(`    · ${m}`);
    console.error('');
    process.exit(1);
  }

  console.log(`\nAlta de «${alta.nombre}» en ${URL_BASE}\n`);
  console.log(`    dirección      ${alta.slug}  (no se puede cambiar después)`);
  console.log(`    dueño          ${alta.mail_del_duenio}`);
  console.log(`    unidades       ${alta.unidades.length} · ${alta.unidades.map((u) => u.codigo).join(', ')}`);
  console.log(`    se reserva     hasta el ${alta.ultima_fecha}`);
  console.log(`    seña           ${alta.porcentaje_sena ?? 50}% · ${alta.horas_vencimiento_sena ?? 6}h para transferir`);
  console.log(
    `    transferencia  ${alta.datos_transferencia ? 'cargada' : 'SIN CARGAR — el huésped va a ver la seña y no el CBU'}`
  );

  if (soloVer) {
    console.log('\n  (--ver: no escribí nada)\n');
    return;
  }

  const duenio = await usuarioDelDuenio(
    alta.mail_del_duenio,
    alta.nombre_del_duenio ?? alta.nombre
  );
  console.log(
    `\n→ dueño ${duenio.ya_estaba ? 'ya estaba' : 'creado'}: ${alta.mail_del_duenio}`
  );

  const res = await fetch(`${URL_BASE}/rest/v1/rpc/crear_complejo`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({
      p_datos: {
        slug: alta.slug,
        nombre: alta.nombre,
        localidad: alta.localidad,
        provincia: alta.provincia,
        duenio: duenio.id,
        whatsapp: alta.whatsapp,
        email: alta.email,
        datos_transferencia: alta.datos_transferencia,
        moneda: alta.moneda,
        zona_horaria: alta.zona_horaria,
        mes_inicio_temporada: alta.mes_inicio_temporada,
        porcentaje_sena: alta.porcentaje_sena,
        horas_vencimiento_sena: alta.horas_vencimiento_sena,
        primera_fecha: alta.primera_fecha ?? null,
        ultima_fecha: alta.ultima_fecha,
        minimo_noches: alta.minimo_noches,
        unidades: alta.unidades,
      },
    }),
  });

  const cuerpo = await res.text();
  if (!res.ok) {
    // Un 404 con PGRST202 es la migración 020 sin aplicar. Decirlo así en vez
    // de mostrar el JSON crudo: es el error que más probablemente aparezca.
    if (res.status === 404 && cuerpo.includes('PGRST202')) {
      throw new Error(
        'crear_complejo() no está en la base: falta aplicar la migración 020.\n' +
          '  Ver supabase/a_mano/02_las_escrituras_del_panel.sql'
      );
    }
    throw new Error(`la base contestó HTTP ${res.status}: ${cuerpo.slice(0, 400)}`);
  }

  const r = JSON.parse(cuerpo) as {
    ok: boolean;
    motivo?: string;
    mensaje?: string;
    id?: string;
    unidades?: number;
    falta?: { precios: boolean; donde_transferir: boolean; whatsapp: boolean };
  };

  if (!r.ok) {
    console.error(`\n✗ ${r.mensaje ?? r.motivo ?? 'no se pudo crear'}\n`);
    process.exit(1);
  }

  console.log(`→ complejo creado: ${r.id}  (${r.unidades} unidades)\n`);

  if (duenio.clave) {
    const salida = `.alojaos-alta-${alta.slug}.json`;
    writeFileSync(
      salida,
      JSON.stringify(
        { url: URL_BASE, slug: alta.slug, duenio: { email: alta.mail_del_duenio, clave: duenio.clave } },
        null,
        2
      ) + '\n',
      { mode: 0o600 }
    );
    console.log(`   La contraseña del dueño quedó en ${salida} (0600, ignorado por git).`);
    console.log(`   Mandásela por un canal que no sea el mismo mail, y que la cambie.\n`);
  } else if (duenio.ya_estaba) {
    console.log(`   Ese dueño ya tenía complejos, así que NO le toqué la contraseña.\n`);
  }

  // ------------------------------------------------------------------
  // Qué le falta para vender
  // ------------------------------------------------------------------
  // Un alta que contesta «listo» y deja un complejo que no vende nada es la
  // misma falla que este sistema persigue en todas sus pantallas.
  const pendientes: string[] = [];
  if (r.falta?.precios) pendientes.push('cargar los precios (en el panel, «Precios por período»)');
  if (r.falta?.donde_transferir) pendientes.push('cargar dónde le transfieren');
  if (r.falta?.whatsapp) pendientes.push('cargar el WhatsApp');
  pendientes.push('prender las reservas (quedan apagadas, y está bien: sin precios no vendería nada)');

  console.log('   Todavía NO vende. Falta:');
  for (const p of pendientes) console.log(`     · ${p}`);

  const url = direccion(alta.slug);
  console.log('');
  if (!url) {
    console.log('   ⚠ No hay NEXT_PUBLIC_ROOT_DOMAIN, así que no sé en qué dirección queda su página.');
  } else if (RAIZ.endsWith('.vercel.app')) {
    // Vercel no da subdominios comodín en `*.vercel.app`, así que esa URL no
    // resuelve. Imprimirla sería dar un link muerto, que es peor que no dar
    // ninguno: el que lo prueba cree que el sistema está roto.
    console.log(
      `   ⚠ Su página iría en ${url}, pero ese dominio NO resuelve:\n` +
        `     Vercel no da subdominios comodín en *.vercel.app. Hasta que el dominio\n` +
        `     propio esté con su comodín *.midominio, este complejo no tiene página.`
    );
  } else {
    console.log(`   Su página: ${url}`);
  }
  console.log(`   El panel: ${process.env.NEXT_PUBLIC_SITE_URL ?? '(sin NEXT_PUBLIC_SITE_URL)'}/panel\n`);
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : e);
  process.exit(1);
});
