/**
 * La página comercial, mirada como la mira alguien que la recibe por WhatsApp.
 *
 *   npm run prueba:comercial
 *   ALOJAOS_BASE=https://alojaos.vercel.app npm run prueba:comercial
 *
 * Una página de venta no tiene «funciones que andan o no andan», así que lo que
 * se prueba es otra cosa: que no prometa lo que no puede cumplir y que no tenga
 * caminos rotos. Los tres que importan:
 *
 *   1. **El teléfono y el mail de contacto.** Es el único llamado a la acción de
 *      toda la página. Salió a producción apuntando a un número de ejemplo que
 *      no es de nadie, y nada falló: el enlace existía, el botón andaba, y el
 *      que lo apretaba no llegaba a ninguna parte. Es el error de siempre —algo
 *      que contesta que está bien sin estarlo— en la página de venta.
 *   2. **Los anclajes del menú.** Un enlace a una sección que no existe deja al
 *      que hizo clic en el mismo lugar, y parece que la página está rota.
 *   3. **Que no se desborde en un celular.** La mitad de la gente la va a abrir
 *      desde un mensaje. Una página con scroll horizontal en el celular se
 *      cierra en dos segundos.
 */

import { chromium } from 'playwright';

const BASE = (process.env.ALOJAOS_BASE ?? 'http://alojaos.test:3000').replace(/\/$/, '');

let fallas = 0;
const verificar = (ok: boolean, nombre: string, detalle = '') => {
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK    ' : 'FALLA '} ${nombre}${ok || !detalle ? '' : `\n       ${detalle}`}`);
};

async function main() {
  console.log(`\nLa página comercial, contra ${BASE}\n`);

  const navegador = await chromium.launch({
    args: ['--host-resolver-rules=MAP alojaos.test 127.0.0.1, MAP *.alojaos.test 127.0.0.1'],
  });

  const contexto = await navegador.newContext();

  try {
    // --- En el celular, que es por donde entra la mayoría ------------------
    for (const [nombre, ancho, alto] of [
      ['celular', 390, 844],
      ['escritorio', 1280, 900],
    ] as const) {
      const page = await contexto.newPage();
      await page.setViewportSize({ width: ancho, height: alto });
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      verificar(desborde <= 1, `no se desborda a lo ancho en ${nombre} (${ancho}px)`, `${desborde}px de más`);
      await page.close();
    }

    const page = await contexto.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    // --- Un solo h1, y que diga de qué se trata ----------------------------
    const h1 = page.locator('h1');
    verificar((await h1.count()) === 1, 'tiene exactamente un h1', `encontré ${await h1.count()}`);

    // --- El contacto: lo único que convierte -------------------------------
    const enlaces = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')
    );

    const whatsapps = enlaces.filter((h) => h.includes('wa.me/'));
    verificar(whatsapps.length > 0, 'hay al menos un enlace a WhatsApp');
    verificar(
      !whatsapps.some((h) => /wa\.me\/0+(\?|$)/.test(h)),
      'el WhatsApp de contacto está cargado',
      'apunta al número sin cargar: falta NEXT_PUBLIC_WHATSAPP_CONTACTO.\n' +
        '       El botón principal de la página de venta no lleva a ninguna parte.'
    );

    const mails = enlaces.filter((h) => h.startsWith('mailto:'));
    verificar(mails.length > 0, 'hay al menos un enlace de mail');
    verificar(
      !mails.some((h) => h.includes('ejemplo.invalid')),
      'el mail de contacto está cargado',
      'apunta al mail sin cargar: falta NEXT_PUBLIC_MAIL_CONTACTO'
    );

    // --- Los anclajes del menú llegan a algún lado -------------------------
    const anclas = enlaces.filter((h) => h.startsWith('#') && h.length > 1);
    // La comprobación va adentro del navegador: `CSS.escape` es del navegador y
    // no existe en Node, y un id con un carácter raro rompería el selector
    // armado a mano.
    const rotas = await page.evaluate(
      (lista: string[]) => lista.filter((a) => !document.getElementById(a.slice(1))),
      anclas
    );
    verificar(
      rotas.length === 0,
      `los ${anclas.length} anclajes del menú llegan a una sección que existe`,
      `rotos: ${rotas.join(', ')}`
    );

    // --- Los enlaces internos contestan ------------------------------------
    // Navegando, no con `page.request.get`: ese pedido sale de Node y no pasa
    // por el resolvedor del navegador, así que `alojaos.test` no existe para
    // él. Navegar es además lo que hace la persona cuando clickea.
    const internos = [...new Set(enlaces.filter((h) => h.startsWith('/')))];
    for (const ruta of internos) {
      const otra = await contexto.newPage();
      const res = await otra.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
      verificar((res?.status() ?? 0) < 400, `el enlace a ${ruta} contesta`, `HTTP ${res?.status()}`);
      await otra.close();
    }

    // --- La calculadora calcula --------------------------------------------
    // Es lo único interactivo de la página. Si se rompiera, mostraría un número
    // congelado, que es peor que no tenerla.
    {
      const antes = await page.locator('text=/noches trabadas/i').first().isVisible().catch(() => false);
      verificar(antes, 'la calculadora está en la página');

      const perilla = page.getByRole('slider', { name: /Señas que se te caen/ });
      const resultado = () => page.locator('p.text-3xl').first().innerText();
      const inicial = await resultado();
      await perilla.fill('10');
      await page.waitForTimeout(200);
      const despues = await resultado();
      verificar(inicial !== despues, 'y el número cambia al mover una perilla', `${inicial} → ${despues}`);
    }

    // --- Lo que la página NO puede decir -----------------------------------
    // AlojaOS no tiene clientes todavía. Un testimonio o un porcentaje de
    // resultados sería inventado, y un dato inventado en una página de venta se
    // cae con una sola pregunta y se lleva puesto todo lo demás.
    {
      const texto = await page.locator('body').innerText();
      const inventos = [
        /\b\d{1,3}\s*%\s*(más|menos)\s+(reservas|ocupación|ingresos|ventas)/i,
        /aument[áa]\s+tus\s+reservas/i,
        /m[áa]s\s+de\s+\d+\s+complejos\s+(ya\s+)?(usan|conf[íi]an)/i,
      ];
      const encontrados = inventos.filter((r) => r.test(texto)).map((r) => r.source);
      verificar(
        encontrados.length === 0,
        'no promete resultados que nadie midió',
        `apareció: ${encontrados.join(' · ')}`
      );
    }
  } finally {
    await navegador.close();
  }

  console.log(fallas === 0 ? '\n✓ la página está entera\n' : `\n✗ ${fallas} problemas\n`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ la prueba se cortó:', e instanceof Error ? e.message : e);
  process.exit(1);
});
