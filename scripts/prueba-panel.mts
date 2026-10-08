/**
 * El panel del dueño, en un navegador de verdad.
 *
 *   npm run prueba:panel
 *
 * Necesita el sitio arriba (`next start` o `npm run dev`) apuntando a un
 * proyecto de Supabase con el complejo de ejemplo sembrado, y las credenciales
 * del dueño:
 *
 *   ALOJAOS_DEMO_EMAIL=duenio@ejemplo.test ALOJAOS_DEMO_CLAVE=… npm run prueba:panel
 *
 * Por qué una batería aparte de `prueba-navegador.mts`: esa corre sin sesión y
 * comprueba lo que ve un huésped. Esta corre CON sesión y comprueba lo que ve y
 * puede hacer un dueño. Mezclarlas obligaría a que cada prueba supiera en qué
 * estado de login está, que es justo la confusión que produce los bugs de
 * permisos.
 *
 * Lo que importa de acá, en orden:
 *
 *   1. que sin sesión no se vea nada del panel;
 *   2. que con sesión se vean las señas del complejo propio **y nada de otro**;
 *   3. que confirmar confirme de verdad, comprobado en la base y no en la
 *      pantalla;
 *   4. que rechazar libere las noches, que es lo que el sistema anterior decía
 *      hacer y no hacía durante siete meses.
 */

import { chromium, type Page, type Browser } from 'playwright';
import { readFileSync } from 'node:fs';

const PUERTO = process.env.ALOJAOS_PORT ?? '3000';
const RAIZ = process.env.ALOJAOS_ROOT_DOMAIN ?? 'alojaos.test';
const BASE = `http://${RAIZ}:${PUERTO}`;
const SLUG = process.env.ALOJAOS_SLUG ?? 'cabanias-del-sol';

function delEnv(clave: string): string {
  try {
    return readFileSync('.env.local', 'utf-8').match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

const MAIL = process.env.ALOJAOS_DEMO_EMAIL ?? 'duenio@ejemplo.test';
const CLAVE = process.env.ALOJAOS_DEMO_CLAVE ?? '';
const URL_SUPA = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? delEnv('NEXT_PUBLIC_SUPABASE_URL')).replace(/\/$/, '');
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? delEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!CLAVE) {
  console.error(
    '\n✗ Falta ALOJAOS_DEMO_CLAVE, la contraseña del dueño de ejemplo.\n' +
      '  La imprime `npx tsx scripts/sembrar-demo.mts` cuando crea el usuario.\n'
  );
  process.exit(1);
}
if (!URL_SUPA || !SERVICIO) {
  console.error(
    '\n✗ Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  Esta batería necesita hablar con la base para preparar el caso de\n' +
      '  prueba y para comprobar en la base lo que la pantalla dice.\n'
  );
  process.exit(1);
}

let fallas = 0;
const verificar = (ok: boolean, nombre: string, detalle = '') => {
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK    ' : 'FALLA '} ${nombre}${ok || !detalle ? '' : `\n       ${detalle}`}`);
};

const cab = { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}`, 'Content-Type': 'application/json' };

/** Pregunta a la base, que es la que sabe. La pantalla es la hipótesis. */
async function base<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${URL_SUPA}/rest/v1/${path}`, {
    ...init,
    headers: { ...cab, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const cuerpo = await res.text();
    // Un 23P01 es la restricción de exclusión: alguien ya tiene esas noches.
    // Dicho así se entiende; dicho como «HTTP 400 {code 23P01…}» manda a
    // revisar el panel cuando el problema es que la prueba pidió unas noches
    // tomadas.
    if (cuerpo.includes('23P01')) {
      throw new Error(
        'esas noches ya están ocupadas en esa unidad: la restricción de exclusión no dejó crear la ' +
          'seña de prueba. Elegí otras fechas en esta batería, o limpiá lo que quedó de antes.\n   ' +
          cuerpo.slice(0, 200)
      );
    }
    throw new Error(`la base contestó HTTP ${res.status}: ${cuerpo.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** El huésped que usa esta batería. Por este nombre se limpia. */
const HUESPED = 'Prueba de Panel';

async function limpiar(): Promise<number> {
  const borradas = await base<unknown[]>(
    `reservas?huesped_nombre=eq.${encodeURIComponent(HUESPED)}`,
    { method: 'DELETE', headers: { Prefer: 'return=representation' } }
  );
  return borradas.length;
}

/**
 * Crea una seña esperando revisión, con comprobante.
 *
 * Se escribe directo con la clave de servicio en vez de pasar por la página:
  * esta batería prueba el panel, no el flujo de reserva, y hacerla pasar por el
 * formulario la ataría a los cambios de esa pantalla.
 */
async function senaDePrueba(conComprobante: boolean, noches: [string, string]): Promise<string> {
  const [complejo] = await base<Array<{ id: string }>>(`complejos?slug=eq.${SLUG}&select=id`);
  if (!complejo) throw new Error(`no encontré el complejo ${SLUG}: ¿sembraste el proyecto?`);

  const unidades = await base<Array<{ id: string; codigo: string }>>(
    `unidades?complejo_id=eq.${complejo.id}&select=id,codigo&order=orden`
  );
  const unidad = unidades.at(-1)!;

  const [fila] = await base<Array<{ id: string }>>('reservas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      complejo_id: complejo.id,
      unidad_id: unidad.id,
      check_in: noches[0],
      check_out: noches[1],
      estado: 'HOLD_TRANSFER',
      origen: 'web',
      huesped_nombre: HUESPED,
      huesped_telefono: '5490000008888',
      huesped_email: 'panel@ejemplo.test',
      personas: 2,
      importe: 200000,
      vence_el: new Date(Date.now() + 5 * 3600_000).toISOString(),
      ...(conComprobante
        ? {
            comprobante_path: `${complejo.id}/placeholder/prueba.jpg`,
            comprobante_subido_el: new Date().toISOString(),
          }
        : {}),
    }),
  });

  return fila.id;
}

async function estadoDe(id: string) {
  const [r] = await base<Array<{ estado: string; vence_el: string | null; motivo_rechazo: string | null }>>(
    `reservas?id=eq.${id}&select=estado,vence_el,motivo_rechazo`
  );
  return r;
}

async function entrar(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mail').fill(MAIL);
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/panel/, { timeout: 15_000 });
}

async function main() {
  console.log(`→ limpiando: borré ${await limpiar()} reserva(s) de una corrida anterior\n`);

  const navegador: Browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP *.${RAIZ} 127.0.0.1, MAP ${RAIZ} 127.0.0.1`],
  });

  try {
    // --- 1. Sin sesión no se ve nada -------------------------------------
    {
      const page = await (await navegador.newContext()).newPage();
      const res = await page.goto(`${BASE}/panel`, { waitUntil: 'domcontentloaded' });
      verificar(page.url().includes('/login'), 'el panel sin sesión manda al login', page.url());
      verificar(
        !(await page.content()).includes('Seña de ejemplo'),
        'y no alcanza a mostrar ninguna reserva por el camino',
        `HTTP ${res?.status()}`
      );
      await page.close();
    }

    // --- 2. Con sesión, las señas del complejo propio ----------------------
    const idConComprobante = await senaDePrueba(true, ['2027-04-05', '2027-04-09']);
    const contexto = await navegador.newContext();
    const page = await contexto.newPage();
    await entrar(page);

    verificar(page.url().includes('/panel'), 'el login con la contraseña correcta entra al panel', page.url());
    verificar((await page.getByText(MAIL).count()) > 0, 'y el panel dice con qué cuenta estás');

    const html = await page.content();
    verificar(html.includes('Cabañas del Sol'), 'se ve el complejo del dueño');
    verificar(html.includes(HUESPED), 'y la seña que espera revisión');
    verificar(
      (await page.getByText(/Comprobante subido el/).count()) > 0,
      'con el aviso de que el comprobante está'
    );

    // Lo que NO tiene que verse: el complejo vecino no es de este dueño. Su
    // nombre no está en la base de ejemplo, así que se comprueba lo que sí se
    // puede: que el panel no liste más complejos que los suyos.
    verificar(
      !html.includes('Posada Vecina'),
      'y nada del complejo de otro dueño'
    );

    // --- 3. Confirmar confirma de verdad ----------------------------------
    // Apuntando a LA fila de esta prueba y no a `.first()`. Con `.first()` la
    // prueba confirmaba la primera reserva de la lista, que puede ser de otra
    // batería o de una reserva real, y después comprobaba en la base la de ella
    // —que seguía pendiente— y reportaba que confirmar no funciona. Una prueba
    // que toca lo que no es su caso no falla: miente.
    const fila = page.locator('li').filter({ hasText: HUESPED });
    verificar(await fila.count() === 1, 'la seña de esta prueba está en la lista una sola vez',
      `encontré ${await fila.count()}`);
    await fila.getByRole('button', { name: 'Confirmar la reserva' }).click();
    await page.waitForTimeout(2500);

    const despuesDeAprobar = await estadoDe(idConComprobante);
    verificar(
      despuesDeAprobar.estado === 'CONFIRMED',
      'confirmar deja la reserva CONFIRMED en la base',
      `quedó en ${despuesDeAprobar.estado}`
    );
    // Esto es de 009: un vencimiento que queda cargado en una reserva ya
    // confirmada la hace contar como atrasada para siempre.
    verificar(
      despuesDeAprobar.vence_el === null,
      'y sin vencimiento colgado',
      `vence_el = ${despuesDeAprobar.vence_el}`
    );
    verificar(
      !(await page.content()).includes(HUESPED),
      'y desaparece de la lista de pendientes'
    );

    // --- 4. Rechazar libera las noches ------------------------------------
    // Es LA prueba del panel. En el sistema anterior el desbloqueo contestaba
    // `{ok: true, deleted_count: 1}` sin tocar nada, y la fecha seguía
    // bloqueada. Siete meses.
    // Noches distintas de las de arriba, a propósito. Esa reserva quedó
    // CONFIRMED y sigue ocupando sus noches, así que reusarlas choca con la
    // restricción de exclusión —que es lo que tiene que hacer—. Que la prueba
    // se cayera ahí no era un bug del panel: era esta batería pidiéndole a la
    // base algo que la base está hecha para no dejar.
    const NOCHES_A_RECHAZAR: [string, string] = ['2027-04-12', '2027-04-16'];
    const idParaRechazar = await senaDePrueba(false, NOCHES_A_RECHAZAR);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const filaSinComprobante = page.locator('li').filter({ hasText: HUESPED });
    verificar(
      (await filaSinComprobante.getByText(/Sin comprobante/).count()) > 0,
      'una seña sin comprobante lo dice'
    );
    verificar(
      await filaSinComprobante.getByRole('button', { name: 'Confirmar la reserva' }).isEnabled(),
      'y se puede confirmar igual, porque el dueño pudo ver la transferencia en su banco'
    );

    const ocupadasAntes = await base<Array<{ check_in: string }>>(
      `rpc/noches_ocupadas`,
      { method: 'POST', body: JSON.stringify({ p_complejo: (await base<Array<{ id: string }>>(`complejos?slug=eq.${SLUG}&select=id`))[0].id }) }
    );
    const estabaOcupada = ocupadasAntes.some((o) => o.check_in === NOCHES_A_RECHAZAR[0]);
    verificar(estabaOcupada, 'antes de rechazar, esas noches figuran ocupadas');

    await filaSinComprobante.getByRole('button', { name: 'Rechazar', exact: true }).click();
    await filaSinComprobante.getByPlaceholder('No llegó la transferencia').fill('La prueba la rechazó.');
    await filaSinComprobante.getByRole('button', { name: /Rechazar y liberar las noches/ }).click();
    await page.waitForTimeout(2500);

    const despuesDeRechazar = await estadoDe(idParaRechazar);
    verificar(
      despuesDeRechazar.estado === 'CANCELLED',
      'rechazar deja la reserva CANCELLED en la base',
      `quedó en ${despuesDeRechazar.estado}`
    );
    verificar(
      despuesDeRechazar.motivo_rechazo === 'La prueba la rechazó.',
      'con el motivo guardado para el dueño',
      `motivo_rechazo = ${despuesDeRechazar.motivo_rechazo}`
    );

    const ocupadasDespues = await base<Array<{ check_in: string }>>(
      `rpc/noches_ocupadas`,
      { method: 'POST', body: JSON.stringify({ p_complejo: (await base<Array<{ id: string }>>(`complejos?slug=eq.${SLUG}&select=id`))[0].id }) }
    );
    verificar(
      !ocupadasDespues.some((o) => o.check_in === NOCHES_A_RECHAZAR[0]),
      'y las noches quedan libres de verdad, no sólo en la pantalla'
    );

    // --- 5. Salir ---------------------------------------------------------
    await page.goto(`${BASE}/salir`, { waitUntil: 'domcontentloaded' });
    verificar(page.url().includes('/login'), 'salir vuelve al login', page.url());
    await page.goto(`${BASE}/panel`, { waitUntil: 'domcontentloaded' });
    verificar(page.url().includes('/login'), 'y después de salir el panel ya no se abre', page.url());

    await contexto.close();
  } finally {
    await navegador.close();
    await limpiar();
  }

  console.log(fallas === 0 ? '\n✓ todo bien' : `\n✗ ${fallas} fallas`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ la prueba se cortó:', e);
  process.exit(1);
});
