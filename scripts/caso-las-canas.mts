/**
 * El caso de Las Cañas, mostrado con su sistema de verdad.
 *
 *   npm run caso
 *
 * Saca dos capturas y graba un recorrido de lascaniasmardecobo.com: la página
 * del complejo y un huésped eligiendo casa, personas y noches hasta ver el
 * precio. Es lo que ve cualquiera que entra a reservar.
 *
 * ==================================================================
 * Las Cañas no se toca: se mira
 * ==================================================================
 * Es un complejo en producción, con huéspedes de verdad. Este script NO
 * reserva, no sube comprobantes y no entra al panel. Y eso no queda librado a
 * que nadie toque el botón equivocado: el navegador tiene una lista cerrada de
 * lo que puede pedirle a su servidor, y todo lo demás se corta antes de salir.
 *
 *   · cualquier GET (la página, las fotos, los precios, las reglas);
 *   · y un único POST: `/api/availability`, que es una consulta —qué noches
 *     están tomadas— aunque la hayan hecho con POST.
 *
 * Crear una reserva, subir un comprobante o cualquier escritura que se agregue
 * el día de mañana quedan afuera por omisión, no por enumeración. Si el
 * recorrido llega a intentar una, la corrida falla y lo dice.
 *
 * El panel del dueño (`admin.html`) no se muestra: tiene los nombres, los
 * teléfonos y los mails de huéspedes reales. Lo que la página comercial muestra
 * del panel sale del demo, que tiene datos inventados.
 */

import { chromium, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITIO = 'https://lascaniasmardecobo.com';
const DESTINO = join(process.cwd(), 'public', 'caso');
const CRUDO = join(process.cwd(), '.caso-crudo');

const ANCHO = 390;
const ALTO = 780;

/** Las peticiones que no son lectura y se dejan pasar. Una sola, y es una consulta. */
const POST_PERMITIDOS = ['/api/availability'];

const cortadas: string[] = [];

/** Pone la lista cerrada en una página. Ver el comentario de arriba. */
async function soloMirar(page: Page) {
  await page.route('**/*', (ruta) => {
    const pedido = ruta.request();
    const metodo = pedido.method();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return ruta.continue();
    const url = new URL(pedido.url());
    if (url.origin === SITIO && metodo === 'POST' && POST_PERMITIDOS.includes(url.pathname)) {
      return ruta.continue();
    }
    cortadas.push(`${metodo} ${url.origin}${url.pathname}`);
    return ruta.abort('blockedbyclient');
  });
}

/** El calendario de flatpickr que esté abierto. */
const calendarioAbierto = '.flatpickr-calendar.open';

/** Avanza el calendario abierto hasta el mes pedido («marzo 2027»). */
async function irAlMes(page: Page, mes: string, anio: string) {
  for (let i = 0; i < 30; i += 1) {
    // El mes es un desplegable (`select`), no un texto: se lee la opción elegida.
    const actual = await page
      .locator(`${calendarioAbierto} .flatpickr-monthDropdown-months`)
      .evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]?.text ?? '');
    const anioActual = await page.locator(`${calendarioAbierto} .cur-year`).inputValue();
    if (actual.trim().toLowerCase() === mes && anioActual === anio) return;
    await page.locator(`${calendarioAbierto} .flatpickr-next-month`).click();
    await page.waitForTimeout(120);
  }
  throw new Error(`el calendario no llegó a ${mes} ${anio}`);
}

/** El primer día habilitado a partir de `desde` en el calendario abierto. */
async function tocarDiaLibre(page: Page, desde: number): Promise<number> {
  const dias = page.locator(
    `${calendarioAbierto} .flatpickr-day:not(.flatpickr-disabled):not(.prevMonthDay):not(.nextMonthDay)`
  );
  const n = await dias.count();
  for (let i = 0; i < n; i += 1) {
    const dia = Number((await dias.nth(i).innerText()).trim());
    if (dia >= desde) {
      await dias.nth(i).click();
      return dia;
    }
  }
  throw new Error(`no hay ningún día libre desde el ${desde}`);
}

async function recorrer(page: Page, conPausas: boolean) {
  const pausa = (ms: number) => page.waitForTimeout(conPausas ? ms : 150);

  // Arranca en la portada del complejo y entra a reservar como entra un
  // huésped: tocando el botón. Así el video muestra que es el sitio de ellos,
  // con su marca, y no una pantalla suelta.
  // `load` y no `networkidle`: la portada tiene videos que siguen bajando, y
  // la red no se queda quieta nunca.
  await page.goto(`${SITIO}/`, { waitUntil: 'load' });
  await pausa(2200);
  await page.locator('a[href*="reservar"]:visible').first().click();
  await page.waitForURL(/reservar/, { timeout: 20_000 });
  await page.waitForLoadState('load');
  await pausa(1400);

  // La tercera casa de la lista, por posición: el código de cada casa es cosa
  // de ellos, y este repo no escribe códigos de unidad de ningún cliente.
  await page.locator('#house').selectOption({ index: 3 });
  // Carga la disponibilidad de esa casa (el POST permitido) y habilita el resto.
  await page.waitForFunction(() => !(document.querySelector('#guests') as HTMLInputElement).disabled, null, {
    timeout: 20_000,
  });
  await pausa(700);
  await page.locator('#guests').fill('4');
  await pausa(600);

  // Las fechas van a mitad de marzo: fuera de temporada alta el mínimo es de
  // dos noches y se entra cualquier día, así que el recorrido no depende de
  // caer en un sábado.
  // flatpickr esconde el input de verdad y muestra uno al lado (`altInput`).
  await page.locator('#checkin ~ input').first().click();
  await page.waitForSelector(calendarioAbierto);
  await pausa(500);
  await irAlMes(page, 'marzo', '2027');
  await pausa(400);
  const entrada = await tocarDiaLibre(page, 10);
  await pausa(700);

  if (!(await page.locator(calendarioAbierto).count())) {
    await page.locator('#checkout ~ input').first().click();
  }
  await page.waitForSelector(calendarioAbierto);
  await tocarDiaLibre(page, entrada + 3);
  await page.waitForSelector('#priceBanner:not(.hidden)', { timeout: 10_000 });
  await page.locator('#priceBanner').scrollIntoViewIfNeeded();
  await pausa(2200); // que se lea el precio
}

async function main() {
  mkdirSync(DESTINO, { recursive: true });
  rmSync(CRUDO, { recursive: true, force: true });
  mkdirSync(CRUDO, { recursive: true });

  console.log(`\nEl caso, desde ${SITIO} (sólo lectura)\n`);
  const navegador = await chromium.launch();

  try {
    // --- La página del complejo, en escritorio -------------------------
    const escritorio = await navegador.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
    const inicio = await escritorio.newPage();
    await soloMirar(inicio);
    await inicio.goto(`${SITIO}/`, { waitUntil: 'networkidle' });
    await inicio.waitForTimeout(1500);
    await inicio.screenshot({ path: join(DESTINO, 'las-canas-inicio.jpg'), quality: 82, type: 'jpeg' });
    console.log('  ✓ las-canas-inicio.jpg');
    await escritorio.close();

    // --- La reserva, en el celular, grabada ----------------------------
    const celular = await navegador.newContext({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: CRUDO, size: { width: ANCHO, height: ALTO } },
    });
    const page = await celular.newPage();
    await soloMirar(page);
    await recorrer(page, true);
    await page.screenshot({ path: join(DESTINO, 'las-canas-precio.jpg'), quality: 82, type: 'jpeg' });
    console.log('  ✓ las-canas-precio.jpg');
    await celular.close(); // el video se escribe al cerrar
  } finally {
    await navegador.close();
  }

  if (cortadas.length > 0) {
    console.error(
      '\n✗ el recorrido intentó escribir en el sistema de Las Cañas, y se cortó:\n   ' +
        cortadas.join('\n   ') +
        '\n   No se guarda nada de esta corrida.\n'
    );
    rmSync(CRUDO, { recursive: true, force: true });
    process.exit(1);
  }

  const [crudo] = readdirSync(CRUDO).filter((f) => f.endsWith('.webm'));
  if (!crudo) throw new Error('no se grabó el recorrido');
  const fuente = join(CRUDO, crudo);
  const escala = `scale=${ANCHO * 2}:-2,fps=24`;
  execFileSync('ffmpeg', ['-y', '-i', fuente, '-an', '-vf', escala, '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(DESTINO, 'las-canas.mp4')], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-i', fuente, '-an', '-vf', escala, '-c:v', 'libvpx-vp9', '-crf', '38',
    '-b:v', '0', '-row-mt', '1', join(DESTINO, 'las-canas.webm')], { stdio: 'ignore' });
  // El póster es el último momento —casa, personas, noches y el precio a la
  // vista—, no el primer cuadro: el video arranca recién cuando entra en
  // pantalla, y hasta entonces el póster tiene que contar solo lo que pasa. El
  // primer cuadro era la portada de ellos con el logo todavía apareciendo.
  execFileSync('ffmpeg', ['-y', '-sseof', '-1.2', '-i', fuente, '-vf', `scale=${ANCHO * 2}:-2`, '-frames:v', '1',
    '-q:v', '4', join(DESTINO, 'las-canas.jpg')], { stdio: 'ignore' });
  rmSync(CRUDO, { recursive: true, force: true });

  const kb = (f: string) => Math.round(statSync(join(DESTINO, f)).size / 1024);
  console.log(`  ✓ las-canas: mp4 ${kb('las-canas.mp4')} KB · webm ${kb('las-canas.webm')} KB · póster ${kb('las-canas.jpg')} KB`);

  const [ancho, alto] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height', '-of', 'csv=p=0', join(DESTINO, 'las-canas.mp4')], { encoding: 'utf-8' })
    .trim().split(',').map(Number);

  writeFileSync(
    join(process.cwd(), 'src', 'components', 'comercial', 'caso.generado.ts'),
    '/**\n' +
      ' * Lo que se muestra del sistema de Las Cañas.\n' +
      ' *\n' +
      ' * GENERADO por `npm run caso`, que recorre lascaniasmardecobo.com sin\n' +
      ' * escribir nada. Editarlo a mano no saca ninguna captura.\n' +
      ' */\n\n' +
      `export const CASO_GRABADO_EL = '${new Date().toISOString().slice(0, 10)}';\n\n` +
      `export const CASO_SITIO = ${JSON.stringify(SITIO)};\n\n` +
      '/** Con la misma forma que una entrada de `VIDEOS`, para que la muestre el mismo componente. */\n' +
      'export const CASO_VIDEO = {\n' +
      "  mp4: '/caso/las-canas.mp4',\n" +
      "  webm: '/caso/las-canas.webm',\n" +
      "  poster: '/caso/las-canas.jpg',\n" +
      `  ancho: ${ancho},\n` +
      `  alto: ${alto},\n` +
      "  que: 'Un huésped entrando a la página de Las Cañas, eligiendo casa, personas y noches, y viendo el precio',\n" +
      `  de: ${JSON.stringify(`${SITIO}/`)},\n` +
      '} as const;\n\n' +
      'export const CASO_CAPTURAS = {\n' +
      "  inicio: { src: '/caso/las-canas-inicio.jpg', ancho: 1920, alto: 1200, que: 'La portada de lascaniasmardecobo.com' },\n" +
      `  precio: { src: '/caso/las-canas-precio.jpg', ancho: ${ANCHO * 2}, alto: ${ALTO * 2}, que: 'La reserva en Las Cañas: casa, personas, noches y precio estimado' },\n` +
      '} as const;\n'
  );
  console.log('\n✓ el caso en public/caso/ y su módulo\n');
}

main().catch((e) => {
  console.error('\n✗ el caso se cortó:', e instanceof Error ? e.message : e);
  rmSync(CRUDO, { recursive: true, force: true });
  process.exit(1);
});
