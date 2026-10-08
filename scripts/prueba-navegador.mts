/**
 * El flujo de reserva, en un navegador de verdad.
 *
 *   ./scripts/dev-local.sh          # en una terminal
 *   npm run build && npm start      # en otra
 *   npx tsx scripts/prueba-navegador.mts
 *
 * Esto existe por una razón concreta: el sistema anterior tenía una batería de
 * pruebas de navegador y **se perdió**, porque vivía fuera del repositorio. Lo
 * que no está versionado no existe la próxima vez.
 *
 * Qué prueba, y por qué cada cosa:
 *
 *   - que la marca del complejo llegue al navegador (venía de 5 archivos HTML);
 *   - que las noches tomadas se vean tomadas, y que el día de salida de una
 *     siga siendo día de entrada para la siguiente;
 *   - que el precio que se muestra cambie cuando la estadía cruza de temporada;
 *   - que el mínimo de noches y el día de entrada obligatorio se expliquen en
 *     la pantalla antes de que la persona complete el formulario;
 *   - que una unidad sin tarifa cargada lo diga en vez de inventar un número;
 *   - y que reservar escriba la reserva, con el importe que calculó la base.
 *
 * El navegador es el de este contenedor; `PLAYWRIGHT_BROWSERS_PATH` ya apunta
 * ahí. `BASE` y `SLUG` se pueden cambiar por entorno.
 */

import { chromium, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PUERTO = process.env.ALOJAOS_PORT ?? '3000';
const SLUG = process.env.ALOJAOS_SLUG ?? 'cabanias-del-sol';
const RAIZ = process.env.ALOJAOS_ROOT_DOMAIN ?? 'alojaos.test';
const BASE = `http://${SLUG}.${RAIZ}:${PUERTO}`;

/** Con este nombre reserva la batería, y por este nombre se limpia. */
const HUESPED = 'Prueba de Navegador';

/** Lee una variable de .env.local, que es donde apunta el entorno. */
function delEnv(clave: string): string {
  try {
    return (
      readFileSync('.env.local', 'utf-8').match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? ''
    );
  } catch {
    return '';
  }
}

/**
 * Borra la reserva que dejó la corrida anterior.
 *
 * La batería reserva de verdad: cuando termina hay un HOLD_TRANSFER del 20 al
 * 24 de noviembre sobre la misma unidad. Correrla dos veces contra la misma
 * base fallaba al tocar el 20, porque esas noches estaban tomadas —y eso es
 * correcto, es la restricción de exclusión haciendo su trabajo—. Pero una
 * batería que sólo pasa la primera vez es una batería que después se explica
 * como «capaz quedó algo colgado», y así se tapa una falla de verdad.
 *
 * Tiene que limpiar en los dos entornos contra los que esto corre, porque si no
 * la segunda corrida de uno de los dos falla y no se sabe por qué:
 *
 *   - contra Supabase, por la API con la clave de servicio;
 *   - contra el Postgres de `dev:local`, con psql.
 *
 * Se borra por el nombre del huésped, que es de la batería y de nadie más.
 */
async function limpiarLoDeAntes(): Promise<string> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? delEnv('NEXT_PUBLIC_SUPABASE_URL')).replace(/\/$/, '');
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? delEnv('SUPABASE_SERVICE_ROLE_KEY');

  // Contra un proyecto Supabase de verdad. Se reconoce por el dominio, no por
  // la presencia de la clave: `dev:local` también deja una clave puesta.
  if (/supabase\.co/.test(url)) {
    if (!servicio) {
      return 'apunta a Supabase y no hay clave de servicio, así que no pude limpiar';
    }
    const res = await fetch(`${url}/rest/v1/reservas?huesped_nombre=eq.${encodeURIComponent(HUESPED)}`, {
      method: 'DELETE',
      headers: {
        apikey: servicio,
        Authorization: `Bearer ${servicio}`,
        Prefer: 'return=representation',
      },
    });
    if (!res.ok) return `no pude limpiar en Supabase: HTTP ${res.status}`;
    const borradas = (await res.json()) as unknown[];
    return borradas.length === 0
      ? 'la base de Supabase estaba limpia'
      : `borré ${borradas.length} reserva(s) en Supabase que había dejado una corrida anterior`;
  }

  // Contra el Postgres de `dev:local`. Cuántas borró lo contesta la base, no el
  // cartel de psql: con `-q` el `DELETE 1` no se imprime, así que leerlo daba
  // siempre cero y el mensaje decía «la base estaba limpia» cuando no lo
  // estaba. Un mensaje tranquilizador y falso, que es justo lo que este
  // proyecto persigue.
  const sql =
    `WITH borradas AS (DELETE FROM reservas WHERE huesped_nombre = '${HUESPED}' RETURNING 1) ` +
    'SELECT count(*) FROM borradas;';
  try {
    const salida = execFileSync(
      'psql',
      ['-h', '127.0.0.1', '-p', process.env.ALOJAOS_DEV_PG_PORT ?? '5433',
       '-U', 'postgres', '-d', 'alojaos', '-t', '-A',
       '-v', 'ON_ERROR_STOP=1', '-c', sql],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 }
    );
    const cuantas = salida.trim();
    return cuantas === '0'
      ? 'la base estaba limpia'
      : `borré ${cuantas} reserva(s) que había dejado una corrida anterior`;
  } catch {
    // Sin psql, o con la base en otro puerto. No se corta: si quedó algo
    // ocupado, `tocarDia()` lo va a decir con todas las letras.
    return 'no pude limpiar (no encontré la base de dev:local); si falla un día ocupado, es por esto';
  }
}

let fallas = 0;
const verificar = (ok: boolean, nombre: string, detalle = '') => {
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK    ' : 'FALLA '} ${nombre}${ok || !detalle ? '' : `\n       ${detalle}`}`);
};

/** Mueve el calendario hasta el mes pedido tocando la flecha. */
async function irAlMes(page: Page, etiqueta: string) {
  for (let i = 0; i < 24; i += 1) {
    const actual = await page.locator('div.mb-3 > div.text-sm').innerText();
    if (actual.trim() === etiqueta) return true;
    await page.getByLabel('Mes siguiente').click();
    await page.waitForTimeout(40);
  }
  // No se devuelve `false` para que lo ignore quien llama: 24 toques sin llegar
  // al mes pedido significa que el calendario no llega hasta ahí, y todo lo que
  // siga va a fallar por otra razón y en otro lugar.
  throw new Error(
    `El calendario no llegó a «${etiqueta}» en 24 toques de «Mes siguiente». ` +
    `Quedó mostrando «${(await page.locator('div.mb-3 > div.text-sm').innerText()).trim()}».`
  );
}

const dia = (page: Page, etiquetaAria: string) => page.getByLabel(etiquetaAria, { exact: true });

/**
 * Toca un día del calendario y, si no se puede, dice por qué.
 *
 * `locator.click()` sobre un día que no está no explica nada: espera 30
 * segundos y tira un TimeoutError con el selector. Eso ya mandó a buscar un bug
 * donde no había ninguno —la batería había dejado una reserva de la corrida
 * anterior, esas noches estaban ocupadas, y el día simplemente no era tocable—.
 *
 * Un día no tocable tiene tres causas posibles y la pantalla las distingue, así
 * que la prueba también:
 *   - el mes que se está mostrando no es el que la prueba cree;
 *   - el día no existe en el calendario (está fuera de la temporada cargada);
 *   - el día existe pero está deshabilitado (ocupado, pasado, o no es día de
 *     entrada según las reglas del complejo).
 */
async function tocarDia(page: Page, etiquetaAria: string) {
  const mes = (await page.locator('div.mb-3 > div.text-sm').innerText()).trim();
  const boton = dia(page, etiquetaAria);

  if ((await boton.count()) === 0) {
    throw new Error(
      `No encontré «${etiquetaAria}» en el calendario. El mes que se está mostrando es «${mes}».\n` +
      '   Si el mes es el correcto, ese día no está en el calendario cargado.'
    );
  }

  if (await boton.isDisabled()) {
    throw new Error(
      `El día «${etiquetaAria}» está en pantalla pero deshabilitado (mes mostrado: «${mes}»).\n` +
      '   Casi siempre es porque esas noches ya están tomadas. La batería DEJA una\n' +
      '   reserva cuando termina, así que correrla dos veces contra la misma base\n' +
      '   falla acá. Levantá el entorno de nuevo con `npm run dev:local`, que parte\n' +
      '   de una base limpia, y volvé a correrla.'
    );
  }

  await boton.click();
}

async function main() {
  console.log(`→ ${await limpiarLoDeAntes()}\n`);

  // El `Host` decide qué complejo se sirve, así que la prueba tiene que pedir
  // por el nombre de verdad. Chromium no permite sobreescribir esa cabecera a
  // mano —y está bien que no—, así que se le resuelve el nombre al navegador,
  // que es exactamente lo que en producción hace el comodín del DNS.
  const navegador = await chromium.launch({
    args: [`--host-resolver-rules=MAP *.${RAIZ} 127.0.0.1`],
  });
  const contexto = await navegador.newContext();
  const page = await contexto.newPage();

  page.on('pageerror', (e) => verificar(false, 'sin errores de JavaScript', String(e)));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // --- La identidad y la marca ---------------------------------------------
  verificar(
    (await page.locator('h1').first().innerText()).includes('Cabañas del Sol'),
    'la página abre con el nombre del complejo'
  );

  const colorDeMarca = await page.evaluate(() =>
    getComputedStyle(document.querySelector('div[style]')!).getPropertyValue('--marca-principal').trim()
  );
  verificar(colorDeMarca === '#2f5d50', 'el color del complejo llegó al navegador', `dio ${colorDeMarca}`);

  verificar(
    (await page.getByText('Máximo 4 personas, ideal 2 adultos y 2 chicos.').count()) > 0,
    'la sugerencia de ocupación es la que cargó el dueño'
  );

  // --- Las noches tomadas se ven tomadas -----------------------------------
  verificar(await irAlMes(page, 'enero 2027'), 'se puede navegar hasta enero de 2027');

  // La unidad 1 tiene tomado del 9 al 16 de enero: las noches 9 a 15 están
  // ocupadas, y el 16 —día de salida— vuelve a ser día de entrada.
  for (const d of [9, 12, 15]) {
    const clases = (await dia(page, `${d} de enero de 2027, ocupada`).getAttribute('class')) ?? '';
    verificar(clases.includes('line-through'), `la noche del ${d} de enero se ve ocupada`);
  }

  const dieciseis = dia(page, '16 de enero de 2027');
  verificar(
    (await dieciseis.count()) === 1 && !(await dieciseis.isDisabled()),
    'el 16 —día de salida de la otra— sigue siendo día de entrada',
    'si esto falla, el dueño pierde una noche por reserva'
  );

  // --- El mínimo de noches y el día de entrada ------------------------------
  // El 16/1/2027 es sábado, y en temporada alta el mínimo es 7 noches.
  await dieciseis.click();
  await tocarDia(page, '19 de enero de 2027');
  await page.waitForTimeout(120);
  verificar(
    (await page.getByText(/mínimo es de 7 noches/).count()) > 0,
    'tres noches en temporada alta avisan que el mínimo es 7'
  );

  // Siete noches desde el sábado: entra.
  await page.getByRole('button', { name: 'elegir otras fechas' }).click().catch(() => {});
  await dieciseis.click();
  await tocarDia(page, '23 de enero de 2027');
  await page.waitForTimeout(150);
  verificar(
    (await page.getByText(/mínimo es de 7 noches/).count()) === 0,
    'siete noches desde el sábado no avisan nada'
  );
  verificar(
    (await page.getByText(/Seña \(50%\)/).count()) > 0,
    'y aparece la seña, con el porcentaje del complejo'
  );

  // Un lunes de temporada alta: el día de entrada no está permitido.
  await page.getByRole('button', { name: 'elegir otras fechas' }).click();
  const lunes = dia(page, '18 de enero de 2027');
  verificar(await lunes.isDisabled(), 'un lunes de temporada alta no se puede elegir como entrada');

  // --- Una estadía que cruza de temporada ----------------------------------
  // Del 19 al 26 de diciembre. El 19 es la última noche de temporada media y
  // el 20 la primera de la alta, así que la estadía se cobra a dos precios.
  //
  // Siete noches entrando sábado, y no dos entrando viernes, porque el tramo de
  // temporada alta exige las dos cosas: cualquier estadía que lo toque lleva su
  // mínimo y su día de entrada. Es la regla del complejo, no un detalle de la
  // prueba.
  await irAlMesAtras(page, 'diciembre 2026');
  await tocarDia(page, '19 de diciembre de 2026');
  await tocarDia(page, '26 de diciembre de 2026');
  await page.waitForTimeout(150);
  const textoPrecio = await page.locator('div.mt-2.rounded-xl').first().innerText();
  // SOL1: una noche a 72.000 (el 19) + seis a 148.000 = 960.000
  verificar(
    textoPrecio.includes('960.000'),
    'una estadía que cruza de temporada cobra cada noche por su fecha',
    textoPrecio.replace(/\n/g, ' | ')
  );
  verificar(
    (await page.getByText(/cruza de temporada/).count()) > 0,
    'y la pantalla lo explica en vez de dejar un número raro'
  );

  // --- Una unidad sin tarifa cargada ---------------------------------------
  await page.getByRole('button', { name: /Cabaña del Tala/ }).click();
  await page.waitForTimeout(120);
  await irAlMes(page, 'enero 2027');
  await tocarDia(page, '9 de enero de 2027');
  await tocarDia(page, '16 de enero de 2027');
  await page.waitForTimeout(150);
  verificar(
    (await page.getByText(/Todavía no tenemos tarifa publicada/).count()) > 0,
    'una unidad sin tarifa lo dice en vez de inventar un precio'
  );

  // --- Reservar de verdad ---------------------------------------------------
  await page.getByRole('button', { name: /Cabaña del Molle/ }).click();
  await page.waitForTimeout(120);
  await irAlMesAtras(page, 'noviembre 2026');
  // El bloque fijo del 20 al 24: tomarlo entero tiene que entrar.
  await tocarDia(page, '20 de noviembre de 2026');
  await tocarDia(page, '24 de noviembre de 2026');
  await page.waitForTimeout(150);

  await page.getByLabel('Personas').fill('2');
  await page.getByLabel('Nombre y apellido').fill(HUESPED);
  await page.getByLabel('DNI').fill('30999888');
  await page.getByLabel('Teléfono').fill('5490000009999');
  await page.getByLabel('Mail').fill('prueba@ejemplo.test');

  await page.getByRole('button', { name: 'Reservar' }).click();
  await page.waitForTimeout(1200);

  const confirmacion = await page.getByText('Te guardamos la unidad').count();
  verificar(confirmacion > 0, 'reservar el bloque fijo entero registra la reserva');

  if (confirmacion > 0) {
    const texto = await page.locator('div.rounded-2xl.border-emerald-200').innerText();
    // SOL3 a 54.000 × 4 noches = 216.000, seña 108.000.
    verificar(
      texto.includes('108.000') && texto.includes('216.000'),
      'con el importe y la seña que calculó la base',
      texto.replace(/\n/g, ' | ')
    );
    verificar(texto.includes('Vence el'), 'y con el vencimiento de la seña a la vista');

    // --- Dónde transferir -------------------------------------------------
    verificar(
      (await page.getByText('Alias: cabanias.del.sol').count()) > 0,
      'la pantalla dice dónde transferir, con lo que cargó el dueño'
    );
    verificar(
      (await page.getByText(/Subí la foto o el PDF/).count()) > 0,
      'y pide el comprobante'
    );
    verificar(
      (await page.getByText('Lo tenemos.').count()) === 0,
      'y todavía NO dice que lo tiene, porque no se subió nada'
    );

    // --- Una falla de subida no se puede ver como éxito -------------------
    // Esto es la prueba del bug histórico. En el sistema anterior la subida
    // contestaba "ok" sin guardar el archivo, durante meses. Acá se corre con
    // la subida rota a propósito —sin clave de servicio— y lo que tiene que
    // pasar es que la pantalla lo diga, no que felicite a nadie.
    //
    // Con la clave cargada este tramo se saltea: ahí la subida funciona y lo
    // que hay que comprobar es lo contrario (ALOJAOS_SUBIDA_ANDA=1).
    const subidaAnda = process.env.ALOJAOS_SUBIDA_ANDA === '1';

    await page.getByLabel('Elegir el comprobante').setInputFiles({
      name: 'transferencia.png',
      mimeType: 'image/png',
      // Un PNG de 1×1 de verdad: el bucket filtra por tipo, así que un archivo
      // que no sea una imagen probaría otra cosa.
      buffer: Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
          '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
        'hex'
      ),
    });
    await page.waitForTimeout(2500);

    if (subidaAnda) {
      verificar(
        (await page.getByText('Lo tenemos.').count()) > 0,
        'con la subida andando, la pantalla confirma que el sistema lo tiene'
      );
    } else {
      verificar(
        (await page.getByText('Lo tenemos.').count()) === 0,
        'con la subida rota, la pantalla NO dice que lo tiene',
        'es el bug que el sistema anterior tuvo durante meses'
      );
      verificar(
        (await page.getByText(/No pudimos guardar el comprobante/).count()) > 0,
        'lo dice con un mensaje para una persona, y ofrece WhatsApp'
      );
    }

    // Y el estado que guarda la base tiene que coincidir con lo que se mostró.
    const estado = await page.evaluate(async () => {
      const id = document.body.innerText.match(/Número de reserva: ([0-9a-f-]{36})/)?.[1];
      if (!id) return null;
      const r = await fetch('/api/estado-reserva?id=' + id);
      return r.ok ? r.json() : null;
    });
    if (estado) {
      verificar(
        estado.comprobante === subidaAnda,
        'y la base dice lo mismo que la pantalla',
        `base: comprobante=${estado.comprobante} · pantalla esperaba ${subidaAnda}`
      );
    }
  }

  // --- Lo que un visitante no puede ver ------------------------------------
  // La página trae las noches ocupadas; no puede traer de quién son.
  const html = await page.content();
  // Los teléfonos de los huéspedes del ejemplo, elegidos para no parecerse al
  // WhatsApp público del complejo: con un número que fuera un trozo de aquél,
  // esta prueba fallaría contra el dato que la página SÍ tiene que mostrar.
  for (const dato of [
    'Reserva de ejemplo',
    'Seña de ejemplo',
    '5491133334444',
    '5491155556666',
    'La usa la familia',
  ]) {
    verificar(!html.includes(dato), `la página no publica «${dato}»`);
  }

  await navegador.close();

  console.log(fallas === 0 ? '\n✓ todo bien' : `\n✗ ${fallas} fallas`);
  process.exit(fallas === 0 ? 0 : 1);
}

/** Igual que irAlMes pero hacia atrás. */
async function irAlMesAtras(page: Page, etiqueta: string) {
  for (let i = 0; i < 24; i += 1) {
    const actual = await page.locator('div.mb-3 > div.text-sm').innerText();
    if (actual.trim() === etiqueta) return true;
    await page.getByLabel('Mes anterior').click();
    await page.waitForTimeout(40);
  }
  // No se devuelve `false` para que lo ignore quien llama: 24 toques sin llegar
  // al mes pedido significa que el calendario no llega hasta ahí, y todo lo que
  // siga va a fallar por otra razón y en otro lugar.
  throw new Error(
    `El calendario no llegó a «${etiqueta}» en 24 toques de «Mes anterior». ` +
    `Quedó mostrando «${(await page.locator('div.mb-3 > div.text-sm').innerText()).trim()}».`
  );
}

main().catch((e) => {
  console.error('\n✗ la prueba se cortó:', e);
  process.exit(1);
});
