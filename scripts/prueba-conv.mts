/**
 * La batería de la página de conversión de AlojaOS (`/conv`).
 *
 *   npm run prueba:conv                                   # contra el servidor local (:3002)
 *   ALOJAOS_BASE=https://alojaos.shop npm run prueba:conv
 *
 * No escribe nada salvo con `CONV_PRUEBA_REAL=1`: entonces manda una consulta
 * de verdad, a nombre de «ZZ Prueba conv (borrar)», que queda en la tabla
 * `consultas` de la base de AlojaOS. Esta batería no la puede borrar sola —no
 * tiene, ni debe tener, la clave de servicio—, así que lo dice al terminar.
 *
 * Los eventos se miden reemplazando `fbq` por un grabador antes de que cargue
 * la página: se prueba lo que la página manda, no lo que Meta dice que recibió.
 */

import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import { afirmar, correrTodas, prueba } from './conv/arnes.mjs';
import { frasesProhibidas } from './conv/frases.mjs';

const BASE = (process.env.ALOJAOS_BASE ?? 'http://localhost:3002').replace(/\/$/, '');
const abrirNavegador = () =>
  chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: (process.env.CHROMIUM_ARGS ?? '').trim().split(/\s+(?=--)/).filter(Boolean),
  });
const LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const REAL = process.env.CONV_PRUEBA_REAL === '1';
let navegador: Browser;

/** Abre /conv con un `fbq` grabador en lugar del de Meta. */
async function abrir(query = '', opciones: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 860 }, ...opciones });
  await ctx.addInitScript(() => {
    const w = window as unknown as { __eventos: unknown[][]; fbq: (...a: unknown[]) => void };
    w.__eventos = [];
    w.fbq = (...a: unknown[]) => w.__eventos.push(a);
  });
  const page = await ctx.newPage();
  const errores: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errores.push(e.message));
  const r = await page.goto(`${BASE}/conv${query}`, { waitUntil: 'networkidle' });
  return { ctx, page, errores, status: r?.status() };
}

const eventos = (page: Page) => page.evaluate(() => (window as unknown as { __eventos: unknown[][] }).__eventos.map((e) => [e[1], e[3]]));

prueba(1, '/conv responde 200 y sin errores en la consola', async () => {
  const { ctx, page, errores, status } = await abrir();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  await ctx.close();
  afirmar(status === 200, `respondió ${status}`);
  afirmar(errores.length === 0, errores.join('\n'));
});

prueba(2, 'sin menú: la barra tiene el logo y una sola acción', async () => {
  const { ctx, page } = await abrir();
  const enlaces = await page.locator('header a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  await ctx.close();
  afirmar(enlaces.length === 1 && enlaces[0] === '#consulta', `la barra tiene: ${JSON.stringify(enlaces)}`);
});

prueba(3, 'la acción principal es la consulta, y no hay ningún «Contratar» que lleve a un pago que no existe', async () => {
  const { ctx, page } = await abrir();
  const principal = await page.locator('main section').first().locator('a').first().getAttribute('href');
  const pagos = await page.locator('a[href*="contratar"], a[href*="checkout"], a[href*="mercadopago"]').count();
  await ctx.close();
  afirmar(principal === '#consulta', `el botón principal va a ${principal}`);
  afirmar(pagos === 0, `hay ${pagos} enlaces a un pago: AlojaOS no se vende online`);
});

prueba(4, 'no dice nada que no podamos sostener', async () => {
  const { ctx, page } = await abrir();
  const texto = await page.evaluate(() => document.body.textContent ?? '');
  await ctx.close();
  const malas = frasesProhibidas(texto);
  afirmar(malas.length === 0, malas.join('\n'));
  // Y no promete lo que no hace: ni sincronización con portales ni cobro con tarjeta.
  const sinPreguntas = texto.replace(/¿Se conecta con Booking o con Airbnb\?[^¿]*/, '').replace(/¿El huésped puede pagar con tarjeta\?[^¿]*/, '');
  afirmar(!/sincroniz|channel manager|multicanal|pag[aá] con tarjeta|mercado ?pago/i.test(sinPreguntas), 'la página promete una integración o un medio de pago que no existe');
});

prueba(5, 'las variantes del titular: ?v= cambia el h1, y una desconocida cae en la base', async () => {
  const titulo = async (q: string) => {
    const { ctx, page } = await abrir(q);
    const t = await page.locator('h1').textContent();
    await ctx.close();
    return t?.trim();
  };
  const base = await titulo('');
  const stock = await titulo('?v=comision');
  const rara = await titulo('?v=<script>');
  afirmar(base !== stock, 'la variante comision muestra el mismo titular que la base');
  afirmar(rara === base, `una variante desconocida mostró «${rara}»`);
});

prueba(6, 'la campaña queda guardada, y la primera visita manda', async () => {
  const { ctx, page } = await abrir('?utm_source=meta&utm_medium=cpc&utm_campaign=cabanas-oct&v=comision&fbclid=abc123');
  await page.goto(`${BASE}/conv?utm_source=otra`, { waitUntil: 'networkidle' });
  const cookie = (await ctx.cookies()).find((c) => c.name === 'conv_atrib');
  await ctx.close();
  afirmar(cookie, 'no se guardó la cookie de atribución');
  const a = JSON.parse(decodeURIComponent(cookie.value));
  afirmar(a.utm_source === 'meta' && a.utm_campaign === 'cabanas-oct' && a.variante === 'comision' && a.fbclid === 'abc123', `atribución: ${cookie.value}`);
  afirmar(cookie.sameSite === 'Lax' && (LOCAL || cookie.secure), `la cookie: sameSite ${cookie.sameSite}, secure ${cookie.secure}`);
});

prueba(7, 'WhatsApp manda Contact una sola vez, sin datos de la persona', async () => {
  const { ctx, page } = await abrir('?utm_source=meta');
  const wa = page.locator('a[data-conv-evento="Contact"]');
  if ((await wa.count()) === 0) {
    await ctx.close();
    afirmar(LOCAL, 'en producción no hay botón de WhatsApp: ¿falta NEXT_PUBLIC_WHATSAPP_CONTACTO?');
    console.log('        (salteada en local: no hay WhatsApp cargado)');
    return;
  }
  await page.evaluate(() => {
    const a = document.querySelector<HTMLAnchorElement>('a[data-conv-evento="Contact"]')!;
    a.addEventListener('click', (e) => e.preventDefault());
    a.click();
    a.click();
  });
  const ev = (await eventos(page)).filter(([n]) => n === 'Contact');
  await ctx.close();
  afirmar(ev.length === 1, `Contact salió ${ev.length} veces`);
});

prueba(8, 'el formulario vacío avisa qué falta y no cuenta un lead', async () => {
  const { ctx, page } = await abrir();
  await page.locator('#consulta button[type="submit"]').click();
  await page.locator('#consulta [role="alert"]').waitFor({ timeout: 10_000 });
  const aviso = await page.locator('#consulta [role="alert"]').textContent();
  const leads = (await eventos(page)).filter(([n]) => n === 'Lead');
  await ctx.close();
  afirmar(/nombre/i.test(aviso ?? ''), `el aviso dice «${aviso}»`);
  afirmar(leads.length === 0, 'salió un Lead sin consulta guardada');
});

prueba(9, 'si se corta la conexión: mensaje claro, los datos quedan y no hay lead', async () => {
  const { ctx, page } = await abrir();
  await page.locator('input[name="nombre"]').fill('Ana');
  await page.locator('input[name="complejo"]').fill('Cabañas de prueba');
  await page.locator('input[name="contacto"]').fill('11 5555 0000');
  // La acción del servidor viaja por POST a la misma página: se corta.
  await page.route(`${BASE}/conv**`, (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
  await page.locator('#consulta button[type="submit"]').click();
  await page.locator('#consulta [role="alert"]').waitFor({ timeout: 15_000 });
  const aviso = await page.locator('#consulta [role="alert"]').textContent();
  const sigue = await page.locator('input[name="complejo"]').inputValue();
  const leads = (await eventos(page)).filter(([n]) => n === 'Lead');
  await ctx.close();
  afirmar(/probá de nuevo/i.test(aviso ?? ''), `el aviso dice «${aviso}»`);
  afirmar(sigue === 'Cabañas de prueba', 'se borraron los datos del formulario');
  afirmar(leads.length === 0, 'salió un Lead con el envío cortado');
});

prueba(10, REAL ? 'consulta de verdad: la base la guarda y recién entonces sale el Lead' : 'consulta de verdad (salteada: CONV_PRUEBA_REAL=1 para correrla)', async () => {
  if (!REAL) return;
  const { ctx, page } = await abrir('?utm_source=prueba&utm_campaign=bateria-conv');
  await page.locator('input[name="nombre"]').fill('ZZ Prueba conv');
  await page.locator('input[name="complejo"]').fill('ZZ Prueba conv (borrar)');
  await page.locator('input[name="contacto"]').fill('prueba-conv@alojaos.shop');
  await page.locator('textarea[name="mensaje"]').fill('Consulta automática de la batería de /conv. Borrala.');
  await page.locator('#consulta button[type="submit"]').click();
  await page.getByText('Recibimos tu consulta').waitFor({ timeout: 20_000 });
  const leads = (await eventos(page)).filter(([n]) => n === 'Lead');
  await ctx.close();
  afirmar(leads.length === 1, `Lead salió ${leads.length} veces`);
  afirmar((leads[0][1] as { eventID?: string })?.eventID, 'el Lead salió sin eventID: Meta no podría descartar el duplicado del servidor');
  console.log('        → quedó «ZZ Prueba conv (borrar)» en la tabla consultas: borrala.');
});

prueba(11, 'en un celular de 360 px no hay scroll de costado', async () => {
  const { ctx, page } = await abrir('', { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  await ctx.close();
  afirmar(ancho === 360, `mide ${ancho}px`);
});

prueba(12, 'un h1, campos con etiqueta y la política de privacidad enlazada', async () => {
  const { ctx, page } = await abrir();
  const h1 = await page.locator('h1').count();
  const sinEtiqueta = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#consulta input:not([name="sitio_web"]), #consulta select, #consulta textarea')).filter((c) => !c.closest('label')).length
  );
  const priv = await page.locator('a[href="/privacidad"]').count();
  await ctx.close();
  const r = await fetch(`${BASE}/privacidad`);
  afirmar(h1 === 1, `${h1} h1`);
  afirmar(sinEtiqueta === 0, `${sinEtiqueta} campos sin etiqueta`);
  afirmar(priv > 0 && r.ok, `privacidad: ${priv} enlaces, responde ${r.status}`);
});

prueba(13, 'título, canonical y vista previa para compartir', async () => {
  const { ctx, page } = await abrir();
  const m = (await page.evaluate(`({
    titulo: document.title,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
    imagen: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
  })`)) as { titulo: string; canonical: string; imagen: string };
  await ctx.close();
  afirmar(m.titulo.startsWith('AlojaOS — '), `título «${m.titulo}»`);
  afirmar(m.canonical.endsWith('/conv'), `canonical «${m.canonical}»`);
  afirmar(/^https?:\/\//.test(m.imagen), `og:image «${m.imagen}»`);
  if (!LOCAL) afirmar(m.canonical === `${BASE}/conv`, `canonical apunta a ${m.canonical}`);
});

prueba(14, 'lo que baja al abrir pesa menos de 1 MB en un celular', async () => {
  const { ctx, page } = await abrir('', { viewport: { width: 390, height: 844 }, isMobile: true });
  const bytes = await page.evaluate(
    () =>
      (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0) +
      ((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.transferSize ?? 0)
  );
  await ctx.close();
  console.log(`        (bajó ${(bytes / 1024).toFixed(0)} KB)`);
  afirmar(bytes < 1024 * 1024, `bajó ${(bytes / 1024).toFixed(0)} KB`);
});

async function main() {
  navegador = await abrirNavegador();
  let codigo = 1;
  try {
    codigo = await correrTodas(`AlojaOS, página de conversión — ${BASE}/conv`);
  } finally {
    await navegador.close();
  }
  process.exit(codigo);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
