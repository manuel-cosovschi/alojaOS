/**
 * Dos dueños, dos complejos: que ninguno vea nada del otro.
 *
 *   npm run prueba:aislamiento-duenos
 *
 * Es la prueba que decide si este producto se puede vender. Todo lo demás es
 * una función que anda o no anda; esto es el nombre, el DNI, el teléfono y el
 * mail de los huéspedes de un complejo a la vista de otro complejo.
 *
 * ------------------------------------------------------------------
 * Por qué con sesiones de verdad y no leyendo las policies
 * ------------------------------------------------------------------
 * `npm run aislamiento` ya comprueba qué puede un visitante sin cuenta, y eso
 * cubre el caso del curioso. No cubre el que importa en un multi-inquilino: un
 * cliente pago, logueado, con un token válido, pidiendo los datos de otro.
 *
 * Y no se puede comprobar leyendo las policies. `es_miembro(complejo_id)` se lee
 * bien; también se leería bien con un `OR true` que alguien dejó probando algo.
 * La única forma es tener dos tokens de dos usuarios y pedir.
 *
 * ------------------------------------------------------------------
 * Lo que se prueba, y por qué cada cosa
 * ------------------------------------------------------------------
 * Se piden las cosas por los tres caminos que existen, porque cada uno se cierra
 * distinto y cerrar dos de tres no sirve de nada:
 *
 *   1. las TABLAS por REST, que es donde manda RLS;
 *   2. las FUNCIONES del panel, que son SECURITY DEFINER y por lo tanto saltean
 *      RLS: ahí lo que protege es el `es_miembro()` que tienen adentro;
 *   3. las que ESCRIBEN —aprobar y rechazar la seña de otro—, que es lo que
 *      convierte una filtración en un daño.
 *
 * Y se prueba con el id de verdad de la reserva del vecino, no con uno
 * inventado: un id inexistente da "no existe" por el motivo equivocado y la
 * prueba pasaría sin probar nada.
 */

import { readFileSync } from 'node:fs';

interface Credenciales {
  url: string;
  duenio: { email: string; id: string; clave: string | null };
  vecino: { email: string; id: string; clave: string | null };
}

function delEnv(clave: string): string {
  try {
    return readFileSync('.env.local', 'utf-8').match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

let cred: Credenciales;
try {
  cred = JSON.parse(readFileSync('.alojaos-demo.json', 'utf-8')) as Credenciales;
} catch {
  console.error(
    '\n✗ No encontré .alojaos-demo.json.\n' +
      '  Corré primero: npx tsx scripts/sembrar-demo.mts\n'
  );
  process.exit(1);
}

const URL_BASE = (delEnv('NEXT_PUBLIC_SUPABASE_URL') || cred.url).replace(/\/$/, '');
const PUBLICA = delEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICIO = delEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!URL_BASE || !PUBLICA || !SERVICIO) {
  console.error('\n✗ Faltan la URL y las claves en .env.local.\n');
  process.exit(1);
}
if (!cred.duenio.clave || !cred.vecino.clave) {
  console.error(
    '\n✗ Falta alguna contraseña en .alojaos-demo.json.\n' +
      '  Volvé a correr scripts/sembrar-demo.mts, que las rota.\n'
  );
  process.exit(1);
}

let fallas = 0;
const verificar = (ok: boolean, nombre: string, detalle = '') => {
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK    ' : 'FALLA '} ${nombre}${ok || !detalle ? '' : `\n       ${detalle}`}`);
};

/** El token de un usuario, pidiéndolo como lo pide el navegador. */
async function token(email: string, clave: string): Promise<string> {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLICA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: clave }),
  });
  if (!res.ok) throw new Error(`no pude entrar como ${email}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

async function comoUsuario(tok: string, path: string, init?: RequestInit) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: PUBLICA,
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  let cuerpo: unknown = null;
  try {
    cuerpo = await res.json();
  } catch {
    /* algunas respuestas vienen vacías */
  }
  return { status: res.status, cuerpo };
}

async function conServicio<T>(path: string): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}` },
  });
  if (!res.ok) throw new Error(`la base contestó HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Una lectura que no tiene que traer nada de otro complejo.
 *
 * Pasa si rebota (401/403) o si trae cero filas de lo ajeno. Que rebote es
 * mejor: significa que el rol no tiene ni el permiso de tabla. Las dos pasan.
 */
function sinFugas(
  nombre: string,
  status: number,
  cuerpo: unknown,
  loQueNoTieneQueEstar: string[]
) {
  if (status === 401 || status === 403 || status === 404) {
    return verificar(true, nombre, `HTTP ${status}`);
  }
  const texto = JSON.stringify(cuerpo ?? '');
  const filtrado = loQueNoTieneQueEstar.filter((d) => texto.includes(d));
  verificar(
    filtrado.length === 0,
    nombre,
    filtrado.length ? `apareció: ${filtrado.join(', ')} — en ${texto.slice(0, 300)}` : ''
  );
}

async function main() {
  console.log(`\nDos dueños contra ${URL_BASE}\n`);

  const tokDuenio = await token(cred.duenio.email, cred.duenio.clave!);
  const tokVecino = await token(cred.vecino.email, cred.vecino.clave!);
  console.log('→ los dos entraron con su contraseña\n');

  // Los ids y los datos de verdad del vecino, leídos con la clave de servicio:
  // así la prueba pide EXACTAMENTE lo que no tiene que poder ver, con el id
  // real. Con un id inventado la respuesta sería "no existe" y la prueba
  // pasaría sin haber probado nada.
  const [complejoVecino] = await conServicio<Array<{ id: string }>>(
    'complejos?slug=eq.posada-vecina&select=id'
  );
  const [complejoDuenio] = await conServicio<Array<{ id: string }>>(
    'complejos?slug=eq.cabanias-del-sol&select=id'
  );
  const [reservaVecino] = await conServicio<Array<{ id: string; huesped_nombre: string }>>(
    `reservas?complejo_id=eq.${complejoVecino.id}&huesped_nombre=eq.Huesped%20Del%20Vecino&select=id,huesped_nombre`
  );

  if (!complejoVecino || !complejoDuenio || !reservaVecino) {
    console.error(
      '\n✗ Falta la siembra. Corré scripts/sembrar-demo.mts, ejemplo.sql y ejemplo-vecino.sql.\n'
    );
    process.exit(1);
  }

  // Los datos de una persona de carne y hueso del otro complejo. Son los que
  // ninguna respuesta puede contener.
  const LO_PRIVADO = ['Huesped Del Vecino', '5491199998888', 'secreto@ejemplo.test', '40111222'];

  // ------------------------------------------------------------------
  console.log('— 1. Las tablas, donde manda RLS —');
  // ------------------------------------------------------------------
  {
    const { status, cuerpo } = await comoUsuario(tokDuenio, 'reservas?select=*');
    sinFugas('un dueño logueado no ve reservas de otro complejo', status, cuerpo, LO_PRIVADO);
  }
  {
    // Pidiendo el complejo ajeno por su id, que es el caso que alguien
    // probaría si tuviera el id.
    const { status, cuerpo } = await comoUsuario(
      tokDuenio,
      `reservas?complejo_id=eq.${complejoVecino.id}&select=*`
    );
    sinFugas('ni pidiéndolas por el id del complejo ajeno', status, cuerpo, LO_PRIVADO);
  }
  {
    const { status, cuerpo } = await comoUsuario(tokDuenio, `reservas?id=eq.${reservaVecino.id}&select=*`);
    sinFugas('ni pidiendo la reserva ajena por su id exacto', status, cuerpo, LO_PRIVADO);
  }
  {
    const { status, cuerpo } = await comoUsuario(tokDuenio, 'complejos?select=slug,nombre,datos_transferencia');
    sinFugas('ni los datos bancarios del otro complejo', status, cuerpo, ['posada.vecina', 'Posada Vecina']);
  }
  {
    const { status, cuerpo } = await comoUsuario(tokDuenio, 'unidades?select=codigo,nombre');
    sinFugas('ni las unidades del otro', status, cuerpo, ['VEC1', 'Departamento del fondo']);
  }
  {
    const { status, cuerpo } = await comoUsuario(tokDuenio, 'complejo_miembros?select=*');
    sinFugas('ni quién es dueño del otro complejo', status, cuerpo, [cred.vecino.id]);
  }

  // ------------------------------------------------------------------
  console.log('\n— 2. Las funciones del panel, que saltean RLS —');
  // ------------------------------------------------------------------
  // Son SECURITY DEFINER: RLS no las frena. Lo único que las frena es el
  // `es_miembro()` que tienen adentro, y eso es lo que se prueba acá.
  {
    const { status, cuerpo } = await comoUsuario(tokDuenio, 'rpc/reservas_pendientes', {
      method: 'POST',
      body: JSON.stringify({ p_complejo: complejoVecino.id }),
    });
    verificar(
      status !== 200,
      'reservas_pendientes() del complejo ajeno rebota',
      `HTTP ${status}: ${JSON.stringify(cuerpo).slice(0, 200)}`
    );
    sinFugas('y no devuelve ningún dato de sus huéspedes', status, cuerpo, LO_PRIVADO);
  }
  {
    const { status, cuerpo } = await comoUsuario(tokDuenio, 'rpc/salud_vencimientos', {
      method: 'POST',
      body: JSON.stringify({ p_complejo: complejoVecino.id }),
    });
    verificar(status !== 200, 'salud_vencimientos() del complejo ajeno rebota', `HTTP ${status}`);
    void cuerpo;
  }
  {
    const { status } = await comoUsuario(tokDuenio, 'rpc/desbloquear', {
      method: 'POST',
      body: JSON.stringify({
        p_complejo: complejoVecino.id,
        p_unidad: null,
        p_desde: '2027-02-10',
        p_hasta: '2027-02-14',
      }),
    });
    verificar(status !== 200, 'desbloquear() en el complejo ajeno rebota', `HTTP ${status}`);
  }

  // ------------------------------------------------------------------
  console.log('\n— 3. Escribir sobre la seña de otro —');
  // ------------------------------------------------------------------
  // Leer de más es una filtración. Escribir de más es plata: una reserva
  // confirmada que el dueño no confirmó, o unas noches liberadas que él había
  // vendido.
  {
    const { status, cuerpo } = await comoUsuario(tokDuenio, 'rpc/aprobar_sena', {
      method: 'POST',
      body: JSON.stringify({ p_reserva: reservaVecino.id }),
    });
    verificar(
      status !== 200,
      'aprobar_sena() sobre la seña de otro rebota',
      `HTTP ${status}: ${JSON.stringify(cuerpo).slice(0, 200)}`
    );
  }
  {
    const { status } = await comoUsuario(tokDuenio, 'rpc/rechazar_sena', {
      method: 'POST',
      body: JSON.stringify({ p_reserva: reservaVecino.id, p_motivo: 'no es mía' }),
    });
    verificar(status !== 200, 'rechazar_sena() sobre la seña de otro rebota', `HTTP ${status}`);
  }
  {
    const { status } = await comoUsuario(tokDuenio, `reservas?id=eq.${reservaVecino.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'CANCELLED' }),
    });
    // Un PATCH que no matchea ninguna fila devuelve 204 y no cambió nada, y
    // eso está bien. Lo que importa es que la fila siga como estaba, y se
    // comprueba abajo.
    verificar(status === 204 || status >= 400, 'el UPDATE directo a la reserva ajena no entra', `HTTP ${status}`);
  }

  // Y que después de todo eso la reserva del vecino esté intacta. Es la
  // comprobación que no depende de ningún código de respuesta: si algo pasó, se
  // ve acá.
  {
    const [despues] = await conServicio<Array<{ estado: string; motivo_rechazo: string | null }>>(
      `reservas?id=eq.${reservaVecino.id}&select=estado,motivo_rechazo`
    );
    verificar(
      despues.estado === 'HOLD_TRANSFER' && despues.motivo_rechazo === null,
      'y la seña del vecino quedó intacta después de todos los intentos',
      `estado=${despues.estado} motivo_rechazo=${despues.motivo_rechazo}`
    );
  }

  // ------------------------------------------------------------------
  console.log('\n— 4. Y para el otro lado, que no sea que el vecino no ve nada —');
  // ------------------------------------------------------------------
  // Una policy que no deja ver NADA también pasa todas las pruebas de arriba.
  // Así que hay que comprobar que cada uno sí ve lo suyo, o lo anterior no
  // prueba aislamiento: prueba que está todo roto.
  {
    const { status, cuerpo } = await comoUsuario(tokVecino, 'reservas?select=huesped_nombre');
    const texto = JSON.stringify(cuerpo ?? '');
    verificar(
      status === 200 && texto.includes('Huesped Del Vecino'),
      'el vecino SÍ ve la reserva de su propio complejo',
      `HTTP ${status}: ${texto.slice(0, 200)}`
    );
    verificar(
      !texto.includes('Reserva de ejemplo') && !texto.includes('Seña de ejemplo'),
      'y no las del otro'
    );
  }
  {
    const { status, cuerpo } = await comoUsuario(tokVecino, 'rpc/reservas_pendientes', {
      method: 'POST',
      body: JSON.stringify({ p_complejo: complejoVecino.id }),
    });
    verificar(
      status === 200 && JSON.stringify(cuerpo).includes('Huesped Del Vecino'),
      'y reservas_pendientes() de su complejo le funciona',
      `HTTP ${status}`
    );
  }
  {
    const { status, cuerpo } = await comoUsuario(tokDuenio, 'rpc/reservas_pendientes', {
      method: 'POST',
      body: JSON.stringify({ p_complejo: complejoDuenio.id }),
    });
    verificar(status === 200, 'y la del primer dueño también', `HTTP ${status}`);
    void cuerpo;
  }

  console.log(
    fallas === 0
      ? '\n✓ Cada dueño ve lo suyo y nada más.\n'
      : `\n✗ ${fallas} ${fallas === 1 ? 'filtración' : 'filtraciones'}.\n`
  );
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ la prueba se cortó:', e instanceof Error ? e.message : e);
  process.exit(1);
});
