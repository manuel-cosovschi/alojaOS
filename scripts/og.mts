/**
 * La imagen que se ve cuando alguien pega el enlace en un mensaje.
 *
 *   npm run og
 *
 * ==================================================================
 * Por qué esto importa más de lo que parece
 * ==================================================================
 * Esta página se reparte por WhatsApp. Un enlace sin imagen de vista previa es
 * un renglón gris con una dirección; uno con imagen ocupa media pantalla del
 * teléfono y se lee antes de abrirlo. Es, con diferencia, la parte de la página
 * que más gente va a ver, y hasta hoy no existía.
 *
 * ==================================================================
 * Por qué un guion y no un archivo dibujado a mano
 * ==================================================================
 * Por lo mismo que las capturas: para que actualizarla sea un comando. El texto
 * y los colores salen de `src/lib/marca-alojaos.ts`, así que si la paleta
 * cambia, esto se vuelve a generar y queda igual que la página. Un PNG dibujado
 * aparte envejece sin que nadie se entere.
 *
 * La tipografía se baja de Google **en esta corrida**, que pasa en mi máquina y
 * no en la de un visitante. Lo que no se puede hacer es que la página se la
 * pida a Google cuando alguien entra; acá no hay nadie entrando.
 */

import { chromium } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NOCHE } from '../src/lib/marca-alojaos.js';

const DESTINO = join(process.cwd(), 'public');
const ANCHO = 1200;
const ALTO = 630;

const html = `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,400..900;1,400..900&display=block" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${ANCHO}px; height: ${ALTO}px;
    background: ${NOCHE.fondo};
    color: ${NOCHE.texto};
    font-family: Archivo, system-ui, sans-serif;
    display: flex; flex-direction: column; justify-content: center;
    padding: 72px 76px;
    position: relative; overflow: hidden;
  }
  .resplandor {
    position: absolute; inset: 0;
    background:
      radial-gradient(44rem 26rem at 78% 12%, rgba(111,214,174,.13), transparent 60%),
      radial-gradient(38rem 22rem at 4% 96%, rgba(177,78,43,.18), transparent 62%);
  }
  .contenido { position: relative; }
  .rotulo {
    font-size: 21px; font-weight: 700; letter-spacing: .28em; text-transform: uppercase;
    color: ${NOCHE.menta};
  }
  h1 {
    margin-top: 26px;
    /* Cinco palabras en cuatro renglones. A 112 px el último se metía en el
       pie; a 92 entran con aire. */
    font-size: 92px; line-height: .95; font-weight: 900; font-style: italic;
    text-transform: uppercase; letter-spacing: -.03em;
    max-width: 13ch;
  }
  h1 span { color: ${NOCHE.accionViva}; }
  .pie {
    position: absolute; left: 76px; right: 76px; bottom: 60px;
    display: flex; align-items: baseline; justify-content: space-between;
    font-size: 25px; color: ${NOCHE.textoSuave};
  }
  .marca { font-weight: 900; font-style: italic; font-size: 32px; color: ${NOCHE.texto}; letter-spacing: -.02em; }
</style></head>
<body>
  <div class="resplandor"></div>
  <div class="contenido">
    <p class="rotulo">Para complejos de 3 a 15 unidades</p>
    <h1>Tu complejo se reserva <span>mientras dormís.</span></h1>
  </div>
  <div class="pie">
    <span class="marca">AlojaOS</span>
    <span>Sin comisión por reserva · alojaos.shop</span>
  </div>
</body></html>`;

async function main() {
  mkdirSync(DESTINO, { recursive: true });

  const navegador = await chromium.launch();
  try {
    const page = await (await navegador.newContext({ viewport: { width: ANCHO, height: ALTO } })).newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    // `document.fonts.ready` y no un `waitForTimeout`: si la fuente todavía no
    // llegó, la imagen sale con la del sistema y nadie se entera hasta que
    // alguien la ve en un teléfono.
    await page.evaluate('document.fonts.ready');
    await page.waitForTimeout(400);

    const conArchivo = await page.evaluate(
      `document.fonts.check('900 italic 86px Archivo')`
    );
    if (!conArchivo) {
      console.error(
        '\n✗ la tipografía no llegó: la imagen saldría con la del sistema y no se\n' +
          '  parecería a la página. No la genero.\n'
      );
      process.exit(1);
    }

    await page.screenshot({ path: join(DESTINO, 'og.png') });
  } finally {
    await navegador.close();
  }

  const kb = Math.round(statSync(join(DESTINO, 'og.png')).size / 1024);
  console.log(`\n✓ public/og.png — ${ANCHO}×${ALTO}, ${kb} KB\n`);
}

main().catch((e) => {
  console.error('\n✗ la imagen se cortó:', e instanceof Error ? e.message : e);
  process.exit(1);
});
