/**
 * Los videos del sistema que muestra la página comercial.
 *
 *   npm run videos                                   # contra producción
 *   ALOJAOS_BASE=http://alojaos.test:3000 npm run videos
 *
 * ==================================================================
 * Qué son, y qué no
 * ==================================================================
 * Son grabaciones de un navegador recorriendo el sistema de verdad: elegir
 * unidad, elegir noches, ver el precio, reservar, transferir. No son una
 * animación dibujada de algo que podría pasar.
 *
 * La diferencia importa por lo mismo que las capturas dejaron de ser dibujos:
 * un video hecho a mano envejece sin que nadie se entere, y además hay que
 * creerle. Este se vuelve a grabar con un comando, y lo que muestra es
 * literalmente lo que hace el sistema hoy — lo mismo que cualquiera puede
 * comprobar abriendo el demo, que está enlazado al lado.
 *
 * ==================================================================
 * Por qué dos formatos y un póster
 * ==================================================================
 * Playwright graba en `webm`. Alcanza para Chrome y Firefox, pero un Safari
 * viejo no lo reproduce, y la mitad de la gente que abre esta página lo hace
 * desde un iPhone. Así que de cada clip salen tres archivos:
 *
 *   · `.mp4` (H.264) — el que anda en todos lados, y va primero;
 *   · `.webm` (VP9) — más chico, lo toma el navegador que puede;
 *   · `.jpg` — el primer cuadro, como póster.
 *
 * El póster no es un detalle: sin él, el lugar del video queda vacío hasta que
 * el archivo baja, y en un celular con mala señal eso es un agujero en la
 * página. Con póster se ve la pantalla desde el primer momento y el video
 * arranca cuando puede.
 *
 * Y se graban sin audio a propósito: un video que suena solo en una página de
 * venta se cierra en dos segundos.
 */

import { chromium, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.ALOJAOS_BASE ?? 'https://alojaos.shop').replace(/\/$/, '');
const SLUG = process.env.ALOJAOS_SLUG ?? 'cabanias-del-sol';
const DESTINO = join(process.cwd(), 'public', 'videos');
const CRUDO = join(process.cwd(), '.videos-crudos');

/** El tamaño del clip. Es un celular, porque es desde donde se reserva. */
const ANCHO = 390;
const ALTO = 780;

const HUESPED = 'Huésped de ejemplo';
const MAIL_HUESPED = 'videos@ejemplo.test';

/**
 * Los clips que la página necesita.
 *
 * Si uno no sale, la corrida falla y no se escribe nada. Sin esto, un selector
 * que cambió dejaría el módulo generado sin esa entrada, la página compilaría
 * contra la versión anterior y en producción quedaría un hueco donde va un
 * video: una corrida que termina bien y un resultado que está mal.
 */
const REQUERIDOS = ['reservar'];

function delEnv(clave: string): string {
  try {
    return readFileSync('.env.local', 'utf8').match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

const URL_SUPA = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? delEnv('NEXT_PUBLIC_SUPABASE_URL')).replace(/\/$/, '');
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? delEnv('SUPABASE_SERVICE_ROLE_KEY');

function direccionDelDemo(): string {
  const u = new URL(BASE);
  u.hostname = `${SLUG}.${u.hostname}`;
  return u.toString().replace(/\/$/, '');
}

async function borrarLaReservaDeLosVideos(): Promise<string> {
  if (!URL_SUPA || !SERVICIO) return 'sin clave de servicio: no borré nada';
  const res = await fetch(`${URL_SUPA}/rest/v1/reservas?huesped_email=eq.${encodeURIComponent(MAIL_HUESPED)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}`, Prefer: 'return=representation' },
  });
  if (!res.ok) return `NO pude borrar: HTTP ${res.status}`;
  return `borré ${((await res.json()) as unknown[]).length} reserva(s)`;
}

/** Avanza el calendario hasta el mes pedido. */
async function irAlMes(page: Page, mes: string): Promise<void> {
  const titulo = page.locator('div.mb-3 > div.text-sm');
  for (let i = 0; i < 24; i += 1) {
    if ((await titulo.innerText()).trim().toLowerCase() === mes) return;
    await page.getByLabel('Mes siguiente').click();
    await page.waitForTimeout(90);
  }
  throw new Error(`no llegué a «${mes}»; el calendario muestra «${(await titulo.innerText()).trim()}»`);
}

/**
 * Escribe como una persona, no como un robot.
 *
 * `fill()` pone el texto de golpe y en un video se ve como un corte. Tipear
 * letra por letra es lo que hace que el clip se lea como alguien usando el
 * sistema, que es exactamente lo que se quiere mostrar.
 */
async function tipear(page: Page, etiqueta: string, texto: string) {
  await page.getByLabel(etiqueta).click();
  await page.getByLabel(etiqueta).type(texto, { delay: 35 });
}

const hechos: Array<{ clave: string; que: string; de: string }> = [];

async function main() {
  mkdirSync(DESTINO, { recursive: true });
  rmSync(CRUDO, { recursive: true, force: true });
  mkdirSync(CRUDO, { recursive: true });

  const demo = direccionDelDemo();
  console.log(`\nVideos de ${demo}\n`);
  console.log(`→ antes de empezar: ${await borrarLaReservaDeLosVideos()}`);

  const raiz = new URL(BASE).hostname;
  const navegador = await chromium.launch({
    args: BASE.startsWith('http://')
      ? [`--host-resolver-rules=MAP ${raiz} 127.0.0.1, MAP *.${raiz} 127.0.0.1`]
      : [],
  });

  try {
    const contexto = await navegador.newContext({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: CRUDO, size: { width: ANCHO, height: ALTO } },
    });
    const page = await contexto.newPage();

    await page.goto(`${demo}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // --- Elegir las noches -------------------------------------------------
    await irAlMes(page, 'enero 2027');
    await page.waitForTimeout(500);
    await page.getByLabel('16 de enero de 2027', { exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByLabel('23 de enero de 2027', { exact: true }).click();
    await page.waitForTimeout(1400); // que se lea el precio

    // --- Dejar los datos ---------------------------------------------------
    await page.getByText('Tus datos').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await tipear(page, 'Nombre y apellido', HUESPED);
    await tipear(page, 'DNI', '30111222');
    await tipear(page, 'Teléfono', '5492230000000');
    await tipear(page, 'Mail', MAIL_HUESPED);
    await page.waitForTimeout(600);

    // --- Reservar ----------------------------------------------------------
    if (SERVICIO) {
      await page.getByRole('button', { name: 'Reservar' }).click();
      await page.waitForSelector('text=Te guardamos la unidad', { timeout: 20_000 });
      await page.evaluate(() => window.scrollTo({ top: 0 }));
      await page.waitForTimeout(2200); // que se lea el plazo y el CBU
    } else {
      console.log('  … no reservo: sin clave de servicio no podría borrar la reserva después');
    }

    await contexto.close(); // el video se escribe al cerrar el contexto
    hechos.push({
      clave: 'reservar',
      que: 'Un huésped eligiendo siete noches, viendo el precio y reservando',
      de: `${demo}/`,
    });
  } finally {
    await navegador.close();
    console.log(`→ al terminar: ${await borrarLaReservaDeLosVideos()}`);
  }

  // ------------------------------------------------------------------
  // De `webm` crudo a los tres archivos que usa la página
  // ------------------------------------------------------------------
  const crudos = readdirSync(CRUDO).filter((f) => f.endsWith('.webm'));
  if (crudos.length !== hechos.length) {
    console.error(`\n✗ esperaba ${hechos.length} grabación(es) y encontré ${crudos.length}.\n`);
    process.exit(1);
  }

  for (let i = 0; i < hechos.length; i += 1) {
    const fuente = join(CRUDO, crudos[i]);
    const { clave } = hechos[i];

    // `-an` saca el audio (no hay, pero que quede explícito), `-movflags
    // +faststart` pone el índice al principio para que empiece a reproducirse
    // mientras baja, y el `crf` alto es a propósito: es una pantalla de
    // interfaz, no una película, y lo que importa es que pese poco.
    execFileSync('ffmpeg', [
      '-y', '-i', fuente, '-an',
      '-vf', `scale=${ANCHO * 2}:-2,fps=24`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      join(DESTINO, `${clave}.mp4`),
    ], { stdio: 'ignore' });

    execFileSync('ffmpeg', [
      '-y', '-i', fuente, '-an',
      '-vf', `scale=${ANCHO * 2}:-2,fps=24`,
      '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1',
      join(DESTINO, `${clave}.webm`),
    ], { stdio: 'ignore' });

    execFileSync('ffmpeg', [
      '-y', '-i', fuente, '-vf', `scale=${ANCHO * 2}:-2`, '-frames:v', '1', '-q:v', '4',
      join(DESTINO, `${clave}.jpg`),
    ], { stdio: 'ignore' });

    const kb = (f: string) => Math.round(statSync(join(DESTINO, f)).size / 1024);
    console.log(`  ✓ ${clave}: mp4 ${kb(`${clave}.mp4`)} KB · webm ${kb(`${clave}.webm`)} KB · póster ${kb(`${clave}.jpg`)} KB`);
  }

  rmSync(CRUDO, { recursive: true, force: true });

  const faltan = REQUERIDOS.filter((r) => !hechos.some((h) => h.clave === r));
  if (faltan.length > 0) {
    console.error(`\n✗ faltan ${faltan.length} video(s) que la página necesita: ${faltan.join(', ')}.\n`);
    process.exit(1);
  }

  // El alto real del mp4, que es el que necesita la página para reservar el
  // espacio. Sale de ffprobe y no de la constante, porque `scale=...:-2`
  // redondea a par y puede no dar exactamente el doble.
  const medir = (f: string) =>
    execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
      join(DESTINO, f),
    ], { encoding: 'utf-8' }).trim().split(',').map(Number);

  const entradas = hechos
    .map((h) => {
      const [ancho, alto] = medir(`${h.clave}.mp4`);
      return (
        `  '${h.clave}': {\n` +
        `    mp4: '/videos/${h.clave}.mp4',\n` +
        `    webm: '/videos/${h.clave}.webm',\n` +
        `    poster: '/videos/${h.clave}.jpg',\n` +
        `    ancho: ${ancho},\n` +
        `    alto: ${alto},\n` +
        `    que: ${JSON.stringify(h.que)},\n` +
        `    de: ${JSON.stringify(h.de)},\n` +
        `  },`
      );
    })
    .join('\n');

  writeFileSync(
    join(process.cwd(), 'src', 'components', 'comercial', 'videos.generado.ts'),
    '/**\n' +
      ' * Los videos que muestra la página comercial.\n' +
      ' *\n' +
      ' * GENERADO por `npm run videos`. Editarlo a mano no graba ningún video:\n' +
      ' * lo que dice acá tiene que ser lo que hay en `public/videos/`.\n' +
      ' */\n\n' +
      `export const VIDEOS_GRABADOS_EL = '${new Date().toISOString().slice(0, 10)}';\n\n` +
      `export const VIDEOS = {\n${entradas}\n} as const;\n`
  );

  console.log(`\n✓ ${hechos.length} video(s) en public/videos/ y su módulo\n`);
}

main().catch((e) => {
  console.error('\n✗ los videos se cortaron:', e instanceof Error ? e.message : e);
  process.exit(1);
});
