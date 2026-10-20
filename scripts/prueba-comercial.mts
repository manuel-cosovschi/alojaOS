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
import { readFileSync } from 'node:fs';
import { huellaDeLaInterfaz } from './huella-interfaz.mjs';
import { CASO_SITIO } from '../src/components/comercial/caso.generado';

const BASE = (process.env.ALOJAOS_BASE ?? 'http://alojaos.test:3000').replace(/\/$/, '');

let fallas = 0;
const verificar = (ok: boolean, nombre: string, detalle = '') => {
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK    ' : 'FALLA '} ${nombre}${ok || !detalle ? '' : `\n       ${detalle}`}`);
};

/**
 * ¿Las capturas que muestra la página son del producto de hoy?
 *
 * Es la única parte de una página de venta que puede quedar vieja sin que nadie
 * lo note: el producto cambia, la imagen se queda, y la página sigue mostrando
 * algo que ya no existe. Nada falla, nadie se entera, y es exactamente la clase
 * de falla que este proyecto persigue, sólo que en forma de PNG.
 *
 * Así que se compara el commit en el que se sacaron contra lo que se tocó
 * después. Se mira `src/app` y `src/components` salvo la carpeta comercial:
 * cambiar el texto de venta no envejece una captura del producto, y si contara,
 * la prueba fallaría en cada retoque y se aprendería a ignorarla.
 */
function capturasAlDia() {
  let manifiesto: { huella_interfaz?: string; sacadas_el?: string };
  try {
    manifiesto = JSON.parse(readFileSync('public/capturas/manifiesto.json', 'utf8'));
  } catch {
    verificar(false, 'las capturas tienen manifiesto', 'falta public/capturas/manifiesto.json: corré `npm run capturas`');
    return;
  }

  const ahora = huellaDeLaInterfaz();
  verificar(
    manifiesto.huella_interfaz === ahora,
    `las capturas son del producto de hoy (sacadas el ${manifiesto.sacadas_el?.slice(0, 10) ?? '?'})`,
    `la interfaz cambió desde que se sacaron: ${manifiesto.huella_interfaz?.slice(0, 8) ?? 'sin huella'} → ${ahora.slice(0, 8)}.\n` +
      '       Corré `npm run capturas` y mirá si cambió alguna imagen.'
  );
}

async function main() {
  console.log(`\nLa página comercial, contra ${BASE}\n`);

  capturasAlDia();

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

    // --- Los enlaces absolutos llevan a algún lado -------------------------
    // Acá se escapó uno de los grandes: el «abrí el demo» del hero salió a
    // producción apuntando a `http://cabanias-del-sol.alojaos.test:3000`, que
    // es mi máquina. El enlace existía, se podía tocar, y no llevaba a ninguna
    // parte. Esta batería miraba los anclajes (`#`) y los internos (`/`), y los
    // absolutos —que son justo los que pueden apuntar a otro lado— no.
    //
    // La regla no es «que no diga .test»: contra el servidor local, decir
    // `.test` es lo CORRECTO. La regla es que un enlace absoluto de esta página
    // tiene que quedar en el mismo dominio desde el que se está sirviendo. Así
    // la prueba vale igual local y en producción, y la que falla es la mezcla,
    // que es exactamente lo que pasó.
    //
    // Hay tres afuera a propósito, y están escritos uno por uno: WhatsApp, el
    // sitio del caso, que la página muestra para que cualquiera entre y lo
    // compare —se toma del módulo que escribe `npm run caso`, el mismo que usa
    // la página, así que no puede quedar un dominio viejo de un lado—, y el
    // panel interno de SOVARE, al que lleva el crédito del pie como en GastroOS
    // (`NEXT_PUBLIC_SOVARE_PANEL_URL`).
    {
      const miDominio = new URL(BASE).hostname;
      const deAfueraAProposito = new Set(['wa.me', new URL(CASO_SITIO).hostname, 'sovare-panel.vercel.app']);
      const absolutos = [...new Set(enlaces.filter((h) => /^https?:\/\//.test(h)))];
      const afuera = absolutos.filter((h) => {
        const host = new URL(h).hostname;
        return host !== miDominio && !host.endsWith(`.${miDominio}`) && !deAfueraAProposito.has(host);
      });
      verificar(
        afuera.length === 0,
        `los ${absolutos.length} enlaces absolutos se quedan en ${miDominio}`,
        `se van a otro lado: ${afuera.join(', ')}`
      );

      // Y que contesten. wa.me queda afuera: le responde distinto a un robot.
      for (const url of absolutos.filter((h) => new URL(h).hostname !== 'wa.me')) {
        const r = await page.request.get(url, { failOnStatusCode: false, timeout: 15_000 }).catch(() => null);
        verificar((r?.status() ?? 0) < 400, `el enlace a ${url} contesta`, `HTTP ${r?.status() ?? 'sin respuesta'}`);
      }
    }

    // --- El video y el demo embebido ---------------------------------------
    // Un `<video>` con una fuente rota no tira ningún error: muestra el póster
    // y se queda quieto para siempre. Es la misma falla de siempre con otra
    // cara, así que se piden los archivos y se mira que contesten.
    {
      const fuentes = await page.evaluate(
        `JSON.stringify(Array.from(document.querySelectorAll('video source')).map(function(s){ return s.src; })
           .concat(Array.from(document.querySelectorAll('video')).map(function(v){ return v.poster; }).filter(Boolean)))`
      );
      const urls = JSON.parse(fuentes as string) as string[];
      verificar(urls.length >= 2, 'el video tiene sus fuentes y su póster', `encontré ${urls.length}`);
      for (const u of urls) {
        const r = await page.request.get(u, { failOnStatusCode: false }).catch(() => null);
        verificar((r?.status() ?? 0) < 400, `el archivo ${u.split('/').pop()} contesta`, `HTTP ${r?.status()}`);
      }

      // El demo ya no va embebido: es un botón que arma una copia del sistema
      // para quien lo toca (`npm run prueba:demo` la recorre entera). Acá se
      // mira lo que esta batería puede mirar sin crear demos: que el botón
      // esté, y que no quede ningún marco cargando un sitio entero de fondo.
      verificar((await page.locator('iframe').count()) === 0, 'la página no carga ningún marco de fondo');
      verificar(
        (await page.locator('#demo [data-boton-demo]').count()) === 1,
        'y la sección del demo tiene su botón para entrar'
      );
    }

    // --- Sin JavaScript, la página se ve entera ----------------------------
    // Las secciones aparecen al scrollear, y una animación de aparición
    // esconde el contenido y confía en que algo lo vuelva a mostrar. Si ese
    // algo no corre, la página de venta queda en blanco: la falla de siempre
    // de este proyecto, vestida de animación.
    //
    // Por eso el estado escondido se aplica sólo bajo `.con-js`, y por eso
    // esto lo comprueba de la única forma que vale: abriendo la página con
    // JavaScript apagado y mirando si el texto está.
    {
      const sinJs = await navegador.newContext({ javaScriptEnabled: false });
      const quieta = await sinJs.newPage();
      await quieta.setViewportSize({ width: 1280, height: 900 });
      await quieta.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

      const texto = await quieta.locator('body').innerText();
      const escondidos = await quieta.evaluate(
        `Array.from(document.querySelectorAll('[data-revelar]'))
           .filter(function (el) { return getComputedStyle(el).opacity !== '1'; }).length`
      );

      verificar(texto.length > 2000, 'sin JavaScript la página igual tiene su texto', `${texto.length} caracteres`);
      verificar(
        escondidos === 0,
        'y no queda ningún bloque escondido esperando una animación',
        `${escondidos} bloques con opacidad distinta de 1`
      );
      await sinJs.close();
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
