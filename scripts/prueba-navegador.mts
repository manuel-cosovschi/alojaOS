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

const PUERTO = process.env.ALOJAOS_PORT ?? '3000';
const SLUG = process.env.ALOJAOS_SLUG ?? 'cabanias-del-sol';
const RAIZ = process.env.ALOJAOS_ROOT_DOMAIN ?? 'alojaos.test';
const BASE = `http://${SLUG}.${RAIZ}:${PUERTO}`;

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
  return false;
}

const dia = (page: Page, etiquetaAria: string) => page.getByLabel(etiquetaAria, { exact: true });

async function main() {
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
  await dia(page, '19 de enero de 2027').click();
  await page.waitForTimeout(120);
  verificar(
    (await page.getByText(/mínimo es de 7 noches/).count()) > 0,
    'tres noches en temporada alta avisan que el mínimo es 7'
  );

  // Siete noches desde el sábado: entra.
  await page.getByRole('button', { name: 'elegir otras fechas' }).click().catch(() => {});
  await dieciseis.click();
  await dia(page, '23 de enero de 2027').click();
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
  await dia(page, '19 de diciembre de 2026').click();
  await dia(page, '26 de diciembre de 2026').click();
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
  await dia(page, '9 de enero de 2027').click();
  await dia(page, '16 de enero de 2027').click();
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
  await dia(page, '20 de noviembre de 2026').click();
  await dia(page, '24 de noviembre de 2026').click();
  await page.waitForTimeout(150);

  await page.getByLabel('Personas').fill('2');
  await page.getByLabel('Nombre y apellido').fill('Prueba de Navegador');
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
  return false;
}

main().catch((e) => {
  console.error('\n✗ la prueba se cortó:', e);
  process.exit(1);
});
