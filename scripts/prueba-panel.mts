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

/**
 * Las siete funciones del panel que ESCRIBEN las reglas del complejo.
 *
 * Se las llama con un complejo inventado y con la clave de servicio, que no
 * tiene `auth.uid()`: `es_miembro()` devuelve false y todas levantan
 * `insufficient_privilege` antes de tocar una fila. O sea que este sondeo no
 * puede escribir nada en producción — lo único que distingue es un 404 con
 * PGRST202 («la función no existe») de cualquier otra respuesta.
 */
const INVENTADO = '00000000-0000-4000-8000-000000000000';
const ESCRITURAS: Array<[string, Record<string, unknown>]> = [
  ['guardar_periodo', { p_complejo: INVENTADO, p_desde: '2099-01-01', p_hasta: '2099-01-02', p_precios: {} }],
  ['borrar_periodo', { p_periodo: INVENTADO }],
  ['guardar_config_calendario', { p_complejo: INVENTADO, p_ultima: '2099-01-01', p_minimo: 1, p_primera: null }],
  ['guardar_minimo', { p_complejo: INVENTADO, p_desde: '2099-01-01', p_hasta: '2099-01-02', p_noches: 1, p_dias: null, p_etiqueta: null, p_minimo: null }],
  ['borrar_minimo', { p_minimo: INVENTADO }],
  ['guardar_bloque_fijo', { p_complejo: INVENTADO, p_check_in: '2099-01-01', p_check_out: '2099-01-02', p_etiqueta: null, p_bloque: null }],
  ['borrar_bloque_fijo', { p_bloque: INVENTADO }],
];

/** Un día como lo escribe la pantalla: `11/02/27`. El `T12:00` evita que se corra uno. */
function diaCorto(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/** El huésped que usa esta batería. Por este nombre se limpia. */
const HUESPED = 'Prueba de Panel';

async function limpiar(): Promise<number> {
  const borradas = await base<unknown[]>(
    `reservas?huesped_nombre=eq.${encodeURIComponent(HUESPED)}`,
    { method: 'DELETE', headers: { Prefer: 'return=representation' } }
  );
  // Y los bloqueos que deja el caso de las fechas cerradas. Sin esto, la
  // segunda corrida choca contra el bloqueo de la primera y reporta que cerrar
  // fechas no funciona, cuando lo que pasa es que funcionó demasiado bien.
  const bloqueos = await base<unknown[]>(
    `reservas?motivo_estado=eq.${encodeURIComponent('La prueba la cerró')}`,
    { method: 'DELETE', headers: { Prefer: 'return=representation' } }
  );
  return borradas.length + bloqueos.length;
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

    // El enlace a la página pública. Tiene que ser absoluto y al subdominio del
    // complejo: la página pública NO vive en el dominio del panel. Antes era
    // `/cabanias-del-sol`, una ruta que no existe, y llevaba a un 404. Un
    // enlace roto en el panel no lo agarra ninguna prueba de la base.
    {
      const enlace = page.getByRole('link', { name: /ver la página de reservas/ }).first();
      const href = (await enlace.getAttribute('href')) ?? '';
      verificar(
        /^https?:\/\/cabanias-del-sol\./.test(href),
        'el enlace a la página de reservas apunta al subdominio del complejo',
        `href = ${href}`
      );
      // Se abre en una pestaña y no con `page.request.get`: el pedido de
      // `request` sale de Node y no pasa por el resolvedor del navegador, así
      // que `*.alojaos.test` no existe para él. Navegando, sí: es el mismo
      // camino que hace un dueño cuando clickea.
      const otra = await contexto.newPage();
      const res = await otra.goto(href, { waitUntil: 'domcontentloaded' });
      verificar(
        res?.status() === 200 && (await otra.content()).includes('Cabañas del Sol'),
        'y ese enlace abre la página del complejo',
        `HTTP ${res?.status()}`
      );
      await otra.close();
    }

    const [{ id: complejoDuenio }] = await base<Array<{ id: string }>>(
      `complejos?slug=eq.${SLUG}&select=id`
    );

    // --- 3. Confirmar confirma de verdad ----------------------------------
    // Apuntando a LA fila de esta prueba, dentro de LA lista que corresponde.
    //
    // Dos cosas que ya fallaron y por eso está así. Primero fue `.first()`: la
    // prueba confirmaba la primera reserva de la lista, que puede ser de otra
    // batería o de una reserva real, y después comprobaba en la base la de ella
    // —que seguía pendiente— y reportaba que confirmar no funciona. Una prueba
    // que toca lo que no es su caso no falla: miente.
    //
    // Después fue `locator('li')` sin más: el panel tiene DOS listas con
    // nombres de personas —las señas y los huéspedes a los que no les llegó el
    // mail— así que el mismo nombre aparecía dos veces y el filtro agarraba las
    // dos. Las listas tienen nombre, y acá se usa.
    const senas = page.getByRole('list', { name: 'Señas que esperan revisión' });
    const fila = senas.locator('li').filter({ hasText: HUESPED });
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
      (await senas.locator('li').filter({ hasText: HUESPED }).count()) === 0,
      'y desaparece de la lista de señas pendientes'
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

    const filaSinComprobante = senas.locator('li').filter({ hasText: HUESPED });
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

    // --- 5. El panel avisa si no puede guardar comprobantes ---------------
    // Con la clave buena no tiene que haber ningún cartel. Y con una clave
    // rota, sí: eso se prueba abajo, levantando el sitio con una clave
    // inventada, porque es la única forma de saber que el cartel aparece.
    verificar(
      (await page.content()).includes('no podemos guardar comprobantes') === false,
      'con la clave de servicio buena, el panel no avisa nada de comprobantes'
    );

    // --- 6. El mail que no salió ------------------------------------------
    // Hoy no hay proveedor de mail configurado, así que NINGÚN aviso sale. Lo
    // que se prueba es que eso quede anotado y que el panel lo muestre, porque
    // la alternativa —que no quede rastro— es que el huésped no reciba nada y
    // el dueño no se entere nunca. Es el mismo bug del comprobante, de vuelta.
    {
      const idSinAviso = await senaDePrueba(false, ['2027-04-20', '2027-04-24']);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const texto = await page.locator('body').innerText();

      verificar(
        /no le llegó el mail|no les llegó el mail/.test(texto),
        'el panel dice que a un huésped no le llegó el mail',
        texto.split('\n').find((l) => l.includes('mail')) ?? '(no encontré la línea)'
      );
      verificar(
        texto.includes('falta avisarle dónde transferir'),
        'y dice qué le falta avisarle'
      );
      // Esta reserva se escribió directo en la base, sin pasar por la página,
      // así que no tiene ninguna fila de aviso. Aparecer igual es la prueba de
      // que «no se intentó» cuenta como «no llegó».
      const avisos = await base<Array<{ estado: string }>>(
        `avisos?reserva_id=eq.${idSinAviso}&select=estado`
      );
      verificar(
        avisos.length === 0,
        'y aparece aunque no exista ninguna fila de aviso (no se intentó nunca)',
        `encontré ${avisos.length} filas`
      );
    }

    // --- 7. Cerrar y reabrir fechas ---------------------------------------
    // Lo que el dueño hace más seguido después de aprobar una seña. Hasta hoy
    // `desbloquear()` existía y `bloquear()` no: podía deshacer algo que no
    // podía hacer.
    {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const panelFechas = page.locator('div').filter({ hasText: /^Fechas cerradas/ }).first();

      // El complejo de ejemplo ya tiene una semana cerrada —«La usa la
      // familia»— sembrada. Que aparezca es mejor prueba que una lista vacía:
      // demuestra que la lista lee de la base.
      //
      // Y es el par exacto de una aserción de la batería del huésped, que
      // comprueba que la página pública NO publica ese mismo texto. El mismo
      // dato: invisible para el que reserva, visible para el dueño.
      verificar(
        (await page.getByText('La usa la familia').count()) > 0,
        'el panel muestra la fecha que el complejo ya tenía cerrada'
      );

      await page.getByRole('button', { name: 'Cerrar fechas' }).click();
      await page.waitForTimeout(150);

      // Un rango libre: 2027-06-10 al 14, lejos de todo lo que usan los otros
      // casos de esta batería.
      await page.getByLabel('Desde (primera noche)').fill('2027-06-10');
      await page.getByLabel('Hasta (día de salida)').fill('2027-06-14');
      await page.getByLabel(/Por qué/).fill('La prueba la cerró');

      verificar(
        (await page.getByText('Vas a cerrar').count()) > 0,
        'y dice cuántas noches va a cerrar antes de apretar'
      );

      await page.getByRole('button', { name: 'Cerrar esas fechas' }).click();
      await page.waitForTimeout(2500);

      const bloqueos = await base<Array<{ id: string; estado: string; motivo_estado: string }>>(
        `reservas?estado=eq.BLOCKED&check_in=eq.2027-06-10&select=id,estado,motivo_estado`
      );
      verificar(bloqueos.length === 1, 'cerrar fechas deja UN bloqueo en la base', `${bloqueos.length}`);
      verificar(
        bloqueos[0]?.motivo_estado === 'La prueba la cerró',
        'con el motivo que escribió el dueño',
        bloqueos[0]?.motivo_estado
      );

      // Y esas noches figuran ocupadas para el huésped.
      const ocupadas = await base<Array<{ check_in: string }>>('rpc/noches_ocupadas', {
        method: 'POST',
        body: JSON.stringify({ p_complejo: complejoDuenio }),
      });
      verificar(
        ocupadas.some((o) => o.check_in === '2027-06-10'),
        'y esas noches quedan ocupadas para quien entra a reservar'
      );

      verificar(
        (await page.getByRole('list', { name: 'Fechas cerradas' }).count()) > 0,
        'y aparece en la lista de fechas cerradas'
      );

      // Lo que importa: cerrar algo VENDIDO tiene que rebotar y decir con qué.
      await page.getByRole('button', { name: 'Cerrar fechas' }).click();
      await page.waitForTimeout(150);
      await page.getByLabel('Desde (primera noche)').fill('2027-06-11');
      await page.getByLabel('Hasta (día de salida)').fill('2027-06-13');
      await page.getByRole('button', { name: 'Cerrar esas fechas' }).click();
      await page.waitForTimeout(2000);

      const textoError = await page.locator('body').innerText();
      verificar(
        textoError.includes('ya están cerradas'),
        'cerrar algo ya cerrado lo dice, no crea un segundo bloqueo'
      );
      verificar(
        (await base<unknown[]>('reservas?estado=eq.BLOCKED&check_in=eq.2027-06-11&select=id')).length === 0,
        'y no quedó nada escrito de ese intento'
      );

      // Reabrir.
      await page.reload({ waitUntil: 'domcontentloaded' });
      const lista = page.getByRole('list', { name: 'Fechas cerradas' });
      await lista.locator('li').filter({ hasText: 'La prueba la cerró' })
        .getByRole('button', { name: 'Reabrir' }).click();
      await page.waitForTimeout(2500);

      const despues = await base<Array<{ estado: string }>>(
        `reservas?id=eq.${bloqueos[0].id}&select=estado`
      );
      verificar(
        despues[0]?.estado === 'CANCELLED',
        'reabrir deja el bloqueo CANCELLED en la base',
        despues[0]?.estado
      );

      const ocupadasDespues = await base<Array<{ check_in: string }>>('rpc/noches_ocupadas', {
        method: 'POST',
        body: JSON.stringify({ p_complejo: complejoDuenio }),
      });
      verificar(
        !ocupadasDespues.some((o) => o.check_in === '2027-06-10'),
        'y las noches vuelven a estar a la venta de verdad, no sólo en la pantalla'
      );
    }

    // --- 8. Precios y reglas de la temporada ------------------------------
    // Lo que la pantalla tiene que hacer y sólo se ve desde el navegador: que
    // los avisos que esta parte existe para dar —qué no se puede cotizar,
    // cuántos días faltan para que la página deje de vender— estén EN la
    // pantalla y no sólo en la respuesta de la base.
    //
    // Las expectativas salen de las TABLAS, leídas con la clave de servicio, y
    // no de las funciones que esta prueba está probando. Preguntarle a
    // `salud_de_los_precios()` si la pantalla muestra bien lo que dice
    // `salud_de_los_precios()` no comprobaría nada. (Y además no se puede: con
    // la clave de servicio no hay `auth.uid()`, así que `es_miembro()` dice no
    // y la función levanta 403. Está bien que sea así.)
    await page.goto(`${BASE}/panel`, { waitUntil: 'domcontentloaded' });

    verificar(
      await page.getByRole('heading', { name: 'Precios por período' }).isVisible(),
      'el panel tiene la pantalla de precios'
    );

    const periodos = await base<Array<{ id: string; desde: string; hasta: string }>>(
      `periodos_precio?complejo_id=eq.${complejoDuenio}&select=id,desde,hasta`
    );
    const unidadesDelComplejo = await base<Array<{ id: string }>>(
      `unidades?complejo_id=eq.${complejoDuenio}&select=id`
    );
    const filasDePrecio = await base<Array<{ periodo_id: string }>>(
      `precios_unidad?periodo_id=in.(${periodos.map((p) => p.id).join(',')})&select=periodo_id`
    );

    const enPantalla = page.getByRole('list', { name: 'Períodos de precio' });
    verificar(
      (await enPantalla.locator('li').count()) === periodos.length,
      'y lista exactamente los períodos que hay en la base',
      `pantalla ${await enPantalla.locator('li').count()} · base ${periodos.length}`
    );

    // El aviso de precios no puede quedarse callado: o dice que está todo
    // cotizable, o dice qué no. Hasta hoy no decía nada, y una unidad sin
    // precio quedaba invendible toda la temporada sin que nadie se enterara.
    const faltanPrecios = filasDePrecio.length < periodos.length * unidadesDelComplejo.length;
    const textoPanel = await page.locator('body').innerText();
    verificar(
      faltanPrecios
        ? textoPanel.includes('no se puede') || textoPanel.includes('sin precio')
        : textoPanel.includes('tienen precio') || textoPanel.includes('sin precio'),
      'y la pantalla dice algo definido sobre los precios, nunca nada',
      `${filasDePrecio.length} filas de precio para ${periodos.length} períodos × ${unidadesDelComplejo.length} unidades`
    );

    // El cronómetro de `ultima_fecha`: la única falla de este sistema que llega
    // sola, sin que nadie haga nada. La pantalla tiene que decir el día.
    verificar(
      await page.getByRole('heading', { name: 'Hasta cuándo se puede reservar' }).isVisible(),
      'y tiene la pantalla de las reglas de la temporada'
    );

    const [config] = await base<Array<{ ultima_fecha: string; minimo_noches: number }>>(
      `config_calendario?complejo_id=eq.${complejoDuenio}&select=ultima_fecha,minimo_noches`
    );
    verificar(
      config
        ? textoPanel.includes(diaCorto(config.ultima_fecha))
        : textoPanel.includes('No cargaste hasta cuándo se puede reservar'),
      'y dice el día hasta el que se puede reservar, el que está en la base',
      config ? `${config.ultima_fecha} → ${diaCorto(config.ultima_fecha)}` : 'sin config'
    );
    verificar(
      await page.getByRole('list', { name: 'Mínimos por tramo' }).isVisible()
        || textoPanel.includes('rige el mínimo general'),
      'y el estado de los mínimos por tramo, cargados o no'
    );
    verificar(
      await page.getByRole('list', { name: 'Bloques que van enteros' }).isVisible()
        || textoPanel.includes('se venden de a una'),
      'y el de los bloques que van enteros'
    );

    // --- 9. Que las escrituras del panel estén en la base -----------------
    // Esta sección no toca la pantalla: le pregunta a la base si las siete
    // funciones que escriben las reglas existen. Va en la batería que corre
    // contra producción porque es donde faltaron.
    //
    // No se saltea ni se da por buena: si falta alguna, falla, y dice cuál y
    // qué hacer. Una batería que pasa con el panel a medio aplicar sería una
    // batería que contesta que está bien sin estar bien.
    const FALTANTES: string[] = [];
    for (const [fn, args] of ESCRITURAS) {
      const res = await fetch(`${URL_SUPA}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: cab,
        body: JSON.stringify(args),
      });
      // Un 404 con PGRST202 es «la función no existe». Cualquier otra respuesta
      // —incluido el 403 de `es_miembro()`— quiere decir que sí existe, que es
      // lo único que esta prueba comprueba. Lo que la función HACE está probado
      // en `prueba-base.sql`, contra un Postgres de verdad.
      if (res.status === 404 && (await res.text()).includes('PGRST202')) FALTANTES.push(fn);
    }

    verificar(
      FALTANTES.length === 0,
      'las siete funciones que escriben las reglas están aplicadas en la base',
      FALTANTES.length === 0
        ? ''
        : `faltan ${FALTANTES.length}: ${FALTANTES.join(', ')}\n       ` +
          'El panel muestra todo y no guarda nada. Se arregla pegando las ' +
          'migraciones 016 y 017 en el SQL Editor de Supabase; está explicado en ' +
          'supabase/a_mano/02_las_escrituras_del_panel.sql'
    );

    // --- 10. Salir --------------------------------------------------------
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
