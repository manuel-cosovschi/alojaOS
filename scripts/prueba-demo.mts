/**
 * El demo guiado, de punta a punta, como lo usa un visitante.
 *
 *   npm run prueba:demo                                      # contra local
 *   ALOJAOS_BASE=https://alojaos.shop npm run prueba:demo    # contra el vivo
 *
 * Toca «Abrir el demo guiado» en la página comercial y recorre todo:
 *
 *   1. que arme la copia y deje al visitante en SU panel, con la guía abierta;
 *   2. que cada paso de la guía señale algo que existe en el panel;
 *   3. que la seña de ejemplo tenga su comprobante, se pueda ver y confirmar;
 *   4. que en la página de su copia pueda reservar como huésped, que la
 *      reserva le llegue al panel, y que NO salga ningún mail;
 *   5. que otro visitante, en otro navegador, no vea nada del primero;
 *   6. que «Reiniciar» lo deje como al principio, y «Salir» borre todo: la
 *      copia, sus reservas y la cuenta.
 *
 * Lo que la pantalla dice se comprueba en la base: una guía que dice
 * «confirmada» sobre una reserva que sigue esperando es la clase de cosa que
 * este proyecto persigue.
 *
 * Crea demos de verdad en la base contra la que corre, y las borra al final
 * —también si se corta a la mitad—. Cada corrida gasta dos del cupo de demos
 * por hora de la IP desde la que corre.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { PASOS_DE_LA_GUIA } from '../src/lib/guia';

const BASE = (process.env.ALOJAOS_BASE ?? 'http://alojaos.test:3000').replace(/\/$/, '');
const ES_LOCAL = BASE.startsWith('http://');

function delEnv(clave: string): string {
  try {
    return readFileSync('.env.local', 'utf-8').match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

const URL_SUPA = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? delEnv('NEXT_PUBLIC_SUPABASE_URL')).replace(/\/$/, '');
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? delEnv('SUPABASE_SERVICE_ROLE_KEY');
if (!URL_SUPA || !SERVICIO) {
  console.error('\n✗ Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY: sin ellas no puedo mirar la base.\n');
  process.exit(1);
}
const base = createClient(URL_SUPA, SERVICIO, { auth: { persistSession: false } });

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const HUESPED = 'Huésped de la Prueba Demo';

let fallas = 0;
const verificar = (ok: boolean, nombre: string, detalle = '') => {
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK    ' : 'FALLA '} ${nombre}${ok || !detalle ? '' : `\n       ${detalle}`}`);
};

/** Las cuentas de demo que esta corrida abrió, para borrarlas pase lo que pase. */
const abiertas = new Set<string>();

async function demoDe(userId: string) {
  const { data } = await base.from('demos').select('complejo_id').eq('user_id', userId).maybeSingle();
  return (data?.complejo_id as string | undefined) ?? null;
}

/** El id del usuario de la sesión de esta página, leído de la base por su complejo. */
async function usuarioDeLaPagina(page: Page): Promise<string | null> {
  const enlace = await page.locator('[data-guia="pagina"]').first().getAttribute('href');
  const slug = enlace ? new URL(enlace).hostname.split('.')[0] : null;
  if (!slug) return null;
  const { data: c } = await base.from('complejos').select('id').eq('slug', slug).maybeSingle();
  if (!c) return null;
  const { data: d } = await base.from('demos').select('user_id').eq('complejo_id', c.id).maybeSingle();
  return (d?.user_id as string | undefined) ?? null;
}

async function entrar(navegador: Browser): Promise<{ page: Page; usuario: string | null }> {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await contexto.newPage();
  page.on('pageerror', (e) => verificar(false, 'sin errores de JavaScript', String(e)));
  await page.goto(`${BASE}/#demo`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-boton-demo]').click();
  await page.waitForURL(/\/panel/, { timeout: 45_000 });
  await page.waitForLoadState('networkidle');
  const usuario = await usuarioDeLaPagina(page);
  if (usuario) abiertas.add(usuario);
  return { page, usuario };
}

async function limpiarLoQueQuedo() {
  for (const id of abiertas) {
    await base.rpc('tirar_demo', { p_user: id });
    await base.auth.admin.deleteUser(id);
  }
}

/** Un tramo de dos noches que la copia puede vender, sacado de sus propios datos. */
async function tramoLibre(complejo: string): Promise<{ desde: string; hasta: string } | null> {
  const { data: periodos } = await base
    .from('periodos_precio')
    .select('desde, hasta, etiqueta')
    .eq('complejo_id', complejo)
    .neq('etiqueta', 'temporada alta')
    .order('desde');
  const hoy = new Date();
  for (const p of periodos ?? []) {
    const inicio = new Date(Math.max(new Date(p.desde).getTime(), hoy.getTime() + 12 * 86_400_000));
    const fin = new Date(inicio.getTime() + 2 * 86_400_000);
    if (fin.getTime() <= new Date(p.hasta).getTime()) {
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      return { desde: iso(inicio), hasta: iso(fin) };
    }
  }
  return null;
}

const etiquetaDelDia = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
};

async function irAlMes(page: Page, iso: string) {
  const [a, m] = iso.split('-').map(Number);
  const objetivo = `${MESES[m - 1]} ${a}`;
  for (let i = 0; i < 24; i += 1) {
    const actual = (await page.locator('div.mb-3 > div.text-sm').innerText()).trim();
    if (actual === objetivo) return;
    await page.getByLabel('Mes siguiente').click();
    await page.waitForTimeout(40);
  }
  throw new Error(`el calendario no llegó a ${objetivo}`);
}

async function main() {
  console.log(`\nEl demo guiado, contra ${BASE}\n`);
  const raiz = new URL(BASE).hostname;
  const navegador = await chromium.launch({
    args: ES_LOCAL ? [`--host-resolver-rules=MAP ${raiz} 127.0.0.1, MAP *.${raiz} 127.0.0.1`] : [],
  });

  try {
    // --- 1. Entrar --------------------------------------------------------
    const { page, usuario } = await entrar(navegador);
    verificar(page.url().includes('/panel'), 'el botón deja al visitante en el panel', page.url());
    verificar(!!usuario, 'con una demo propia en la base');
    const complejo = usuario ? await demoDe(usuario) : null;

    verificar(await page.locator('[data-cartel-demo]').isVisible(), 'el panel dice que es una demo');
    verificar(
      (await page.locator('header').innerText()).includes('Demo') &&
        !(await page.locator('header').innerText()).includes('@demo.alojaos.shop'),
      'y no muestra el mail inventado de la cuenta'
    );

    const tarjeta = page.locator('[data-guia-tarjeta]');
    await tarjeta.waitFor({ timeout: 10_000 });
    verificar(
      (await tarjeta.getAttribute('data-guia-tarjeta')) === PASOS_DE_LA_GUIA[0].id,
      'la guía arranca sola, en el primer paso'
    );

    // --- 2. Cada paso señala algo que existe --------------------------------
    for (let i = 0; i < PASOS_DE_LA_GUIA.length; i += 1) {
      const paso = PASOS_DE_LA_GUIA[i];
      const enPantalla = await tarjeta.getAttribute('data-guia-tarjeta');
      if (enPantalla !== paso.id) {
        verificar(false, `la guía muestra el paso «${paso.id}»`, `mostró «${enPantalla}»`);
        break;
      }
      if (paso.objetivo) {
        const objetivo = page.locator(`[data-guia="${paso.objetivo}"]`).first();
        verificar(
          (await objetivo.count()) > 0 && (await objetivo.isVisible()),
          `el paso «${paso.titulo}» señala algo que está en el panel`
        );
      }
      if (i < PASOS_DE_LA_GUIA.length - 1) {
        await page.getByRole('button', { name: /Empezar|Siguiente/ }).click();
        await page.waitForTimeout(250);
      }
    }
    const abrirComoHuesped = page.getByRole('link', { name: /Abrir mi página como huésped/ });
    verificar(await abrirComoHuesped.isVisible(), 'el último paso ofrece abrir la página como huésped');
    const direccionHuesped = (await abrirComoHuesped.getAttribute('href')) ?? '';
    await page.getByRole('button', { name: 'Terminar' }).click();
    verificar((await tarjeta.count()) === 0, 'y «Terminar» cierra la guía');

    // --- 3. La seña de ejemplo ----------------------------------------------
    const senas = page.locator('[data-guia="senas"]');
    const textoSenas = await senas.innerText();
    verificar(textoSenas.includes('Lucas Pereyra') && textoSenas.includes('Carla Ruiz'),
      'la copia trae las dos señas de ejemplo');

    const filaLucas = senas.locator('li', { hasText: 'Lucas Pereyra' });
    const [ventana] = await Promise.all([
      page.waitForEvent('popup', { timeout: 15_000 }).catch(() => null),
      filaLucas.getByRole('button', { name: 'Ver' }).click(),
    ]);
    if (ventana) await ventana.waitForLoadState('load').catch(() => {});
    const urlComprobante = ventana?.url() ?? '';
    const bajado = urlComprobante ? await page.request.get(urlComprobante).catch(() => null) : null;
    verificar(!!bajado && bajado.ok() && (bajado.headers()['content-type'] ?? '').startsWith('image/'),
      'el comprobante de ejemplo se abre', urlComprobante || 'no se abrió nada');
    await ventana?.close();

    await filaLucas.getByRole('button', { name: 'Confirmar la reserva' }).click();
    await page.waitForTimeout(2500);
    const { data: lucas } = await base.from('reservas').select('estado')
      .eq('complejo_id', complejo ?? '').eq('huesped_nombre', 'Lucas Pereyra').maybeSingle();
    verificar(lucas?.estado === 'CONFIRMED', 'confirmar la seña la deja CONFIRMED en la base', `quedó ${lucas?.estado}`);

    // --- 4. Reservar como huésped en la copia -------------------------------
    const tramo = complejo ? await tramoLibre(complejo) : null;
    verificar(!!tramo, 'la copia tiene noches a la venta desde ya', 'ningún período sin mínimo por delante');
    verificar(direccionHuesped.includes('demo-'), 'la página del huésped es la de la copia, no la del demo público',
      direccionHuesped);

    if (tramo && direccionHuesped) {
      const huesped = await page.context().newPage();
      await huesped.goto(direccionHuesped, { waitUntil: 'networkidle' });
      verificar(await huesped.locator('[data-cartel-demo]').isVisible(),
        'la página del huésped de la copia dice que es la demo');
      const robots = await huesped.locator('meta[name="robots"]').getAttribute('content').catch(() => null);
      verificar((robots ?? '').includes('noindex'), 'y le pide a los buscadores que no la indexen', `robots: ${robots}`);

      await irAlMes(huesped, tramo.desde);
      await huesped.getByLabel(etiquetaDelDia(tramo.desde), { exact: true }).click();
      if (tramo.hasta.slice(0, 7) !== tramo.desde.slice(0, 7)) await irAlMes(huesped, tramo.hasta);
      await huesped.getByLabel(etiquetaDelDia(tramo.hasta), { exact: true }).click();
      await huesped.getByLabel('Nombre y apellido').fill(HUESPED);
      await huesped.getByLabel('DNI').fill('30111222');
      await huesped.getByLabel('Teléfono').fill('5490000009999');
      await huesped.getByLabel('Mail').fill('prueba-demo@ejemplo.test');
      await huesped.getByRole('button', { name: 'Reservar' }).click();
      const reservo = await huesped.waitForSelector('text=Te guardamos la unidad', { timeout: 20_000 })
        .then(() => true).catch(() => false);
      verificar(reservo, 'el visitante reserva como huésped en su copia');

      // El aviso se anota después de contestar (`after()`): se le da un momento.
      let aviso: { estado: string } | null = null;
      for (let i = 0; i < 10 && !aviso; i += 1) {
        await huesped.waitForTimeout(800);
        const { data: r } = await base.from('reservas').select('id')
          .eq('complejo_id', complejo ?? '').eq('huesped_nombre', HUESPED).maybeSingle();
        if (r) {
          const { data: a } = await base.from('avisos').select('estado').eq('reserva_id', r.id).maybeSingle();
          aviso = (a as { estado: string } | null) ?? null;
        }
      }
      verificar(aviso?.estado === 'DEMO', 'y NO sale ningún mail: el aviso queda anotado como DEMO',
        `el aviso quedó ${aviso?.estado ?? 'sin anotar'}`);
      await huesped.close();

      await page.reload({ waitUntil: 'networkidle' });
      verificar((await page.locator('[data-guia="senas"]').innerText()).includes(HUESPED),
        'la reserva del huésped le llega al panel');
    }

    // --- 5. Otro visitante no ve nada del primero ---------------------------
    const otro = await entrar(navegador);
    const otroComplejo = otro.usuario ? await demoDe(otro.usuario) : null;
    verificar(!!otroComplejo && otroComplejo !== complejo, 'el segundo visitante recibe otra copia');
    const textoOtro = await otro.page.locator('main').innerText();
    verificar(!textoOtro.includes(HUESPED), 'y no ve la reserva que hizo el primero');
    const { data: lucasOtro } = await base.from('reservas').select('estado')
      .eq('complejo_id', otroComplejo ?? '').eq('huesped_nombre', 'Lucas Pereyra').maybeSingle();
    verificar(lucasOtro?.estado === 'HOLD_TRANSFER', 'ni la seña que el primero confirmó: la suya sigue esperando');

    // --- 6. Reiniciar y salir -----------------------------------------------
    await page.getByRole('button', { name: 'Reiniciar' }).click();
    await page.waitForURL(/\/panel/, { timeout: 45_000 });
    await page.waitForLoadState('networkidle');
    const despues = usuario ? await demoDe(usuario) : null;
    verificar(!!despues && despues !== complejo, 'reiniciar arma una copia nueva para la misma cuenta');
    verificar(!(await page.locator('main').innerText()).includes(HUESPED),
      'y vuelve al principio: la reserva de prueba ya no está');
    const { count: viejas } = await base.from('reservas').select('id', { count: 'exact', head: true })
      .eq('complejo_id', complejo ?? '');
    verificar(viejas === 0, 'la copia anterior se borró con sus reservas', `quedaron ${viejas}`);

    for (const visitante of [{ page, usuario }, otro]) {
      // Al salir, el botón del cartel: el del encabezado hace lo mismo.
      await visitante.page.locator('[data-cartel-demo]').getByRole('button', { name: 'Salir' }).click();
      await visitante.page.waitForURL((u) => !u.pathname.startsWith('/panel'), { timeout: 30_000 });
      if (!visitante.usuario) continue;
      const quedo = await demoDe(visitante.usuario);
      const { data: cuenta } = await base.auth.admin.getUserById(visitante.usuario);
      verificar(!quedo && !cuenta?.user, 'salir borra la copia y la cuenta, en el momento',
        `copia: ${quedo ?? 'no'} · cuenta: ${cuenta?.user ? 'sigue' : 'no'}`);
      if (!quedo && !cuenta?.user) abiertas.delete(visitante.usuario);
    }
  } finally {
    await navegador.close();
    await limpiarLoQueQuedo();
  }

  console.log(fallas === 0 ? '\n✓ el demo guiado anda' : `\n✗ ${fallas} fallas`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('\n✗ la prueba se cortó:', e instanceof Error ? e.message : e);
  await limpiarLoQueQuedo().catch(() => {});
  process.exit(1);
});
