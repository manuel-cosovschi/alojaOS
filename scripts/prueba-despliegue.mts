/**
 * El sitio desplegado, en un navegador de verdad.
 *
 *   npm run prueba:despliegue
 *   ALOJAOS_BASE=https://alojaos.shop npm run prueba:despliegue
 *
 * Las otras baterías corren contra `next start` en esta máquina. Esta corre
 * contra el despliegue, y comprueba las cosas que sólo pueden fallar allá:
 *
 *   - las cookies de sesión son `Secure` y `SameSite`, y el middleware corre en
 *     el edge y no en Node. Si la sesión se rompiera por eso, el panel andaría
 *     perfecto en local y mandaría al login en producción;
 *   - las variables de entorno las puso Vercel, no un archivo. Una que falte
 *     —la clave de servicio, por ejemplo— no se nota en local;
 *   - y el despliegue puede estar detrás de la protección de Vercel, que
 *     contesta un 302 al login de Vercel. Para un huésped eso es una pared, y
 *     es exactamente la clase de cosa que se descubre cuando un cliente avisa
 *     que su página no abre.
 *
 * Un build que compila no es una función que anda.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = (process.env.ALOJAOS_BASE ?? 'https://alojaos.vercel.app').replace(/\/$/, '');

interface Credenciales {
  duenio: { email: string; clave: string | null };
}

let cred: Credenciales | null = null;
try {
  cred = JSON.parse(readFileSync('.alojaos-demo.json', 'utf-8')) as Credenciales;
} catch {
  /* sin credenciales se corre la mitad pública, y se dice */
}

let fallas = 0;
const verificar = (ok: boolean, nombre: string, detalle = '') => {
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK    ' : 'FALLA '} ${nombre}${ok || !detalle ? '' : `\n       ${detalle}`}`);
};

async function main() {
  console.log(`\nEl despliegue, contra ${BASE}\n`);

  // Lo primero, antes de abrir un navegador: que la página conteste 200 y no
  // un 302 a la protección de Vercel. Es un `fetch` y no una navegación porque
  // un navegador seguiría el redirect y la prueba vería la pantalla de login de
  // Vercel sin entender por qué.
  {
    const res = await fetch(`${BASE}/`, { redirect: 'manual' });
    const destino = res.headers.get('location') ?? '';
    if (res.status >= 300 && res.status < 400 && /vercel\.com\/sso-api|vercel\.com\/login/.test(destino)) {
      verificar(
        false,
        'la página abre sin estar logueado en Vercel',
        'el despliegue está detrás de la protección de Vercel: un huésped ve una pantalla de login de Vercel.\n' +
          '       Se apaga en Project Settings → Deployment Protection, dejándola sólo para preview.'
      );
    } else {
      verificar(res.status === 200, 'la página abre sin estar logueado en Vercel', `HTTP ${res.status} ${destino}`);
    }
  }

  const navegador = await chromium.launch();
  try {
    const page = await (await navegador.newContext()).newPage();

    // --- La página comercial ------------------------------------------------
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const comercial = await page.locator('body').innerText();
    verificar(
      comercial.includes('nunca dos veces la misma noche'),
      'la página comercial se sirve en el dominio principal'
    );
    verificar(
      comercial.includes('Qué todavía no hace'),
      'y dice lo que el producto todavía no hace'
    );

    // --- El panel sin sesión ------------------------------------------------
    await page.goto(`${BASE}/panel`, { waitUntil: 'domcontentloaded' });
    verificar(page.url().includes('/login'), 'el panel sin sesión manda al login', page.url());

    if (!cred?.duenio.clave) {
      console.log(
        '\nOMITO la parte con sesión: falta .alojaos-demo.json con la contraseña del dueño.\n' +
          'Corré `npx tsx scripts/sembrar-demo.mts` si querés probarla.'
      );
    } else {
      // --- Entrar -----------------------------------------------------------
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Mail').fill(cred.duenio.email);
      await page.getByLabel('Contraseña').fill(cred.duenio.clave);
      await page.getByRole('button', { name: 'Entrar' }).click();
      await page.waitForURL(/\/panel/, { timeout: 25_000 }).catch(() => {});

      verificar(page.url().includes('/panel'), 'el login entra al panel', page.url());

      const panel = await page.locator('body').innerText();
      verificar(panel.includes('Cabañas del Sol'), 'y se ve el complejo del dueño');
      verificar(!panel.includes('Posada Vecina'), 'y nada del complejo de otro dueño');

      // Lo que sólo se puede comprobar allá: que la clave de servicio que
      // cargó Vercel sirva. Si faltara o estuviera revocada, el panel lo
      // diría, y eso es precisamente lo que no queremos descubrir por una
      // queja.
      verificar(
        !panel.includes('no podemos guardar comprobantes'),
        'la clave de servicio del despliegue sirve'
      );

      verificar(
        /vencimiento de las señas corre solo|vencimiento automático no está bien/.test(panel),
        'el panel informa el estado del vencimiento, ande o no ande'
      );

      // --- Y la contraseña mal ----------------------------------------------
      await page.goto(`${BASE}/salir`, { waitUntil: 'domcontentloaded' });
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Mail').fill(cred.duenio.email);
      await page.getByLabel('Contraseña').fill('esta-no-es-la-contrasena');
      await page.getByRole('button', { name: 'Entrar' }).click();
      await page.waitForTimeout(3000);

      const conError = await page.locator('body').innerText();
      verificar(conError.includes('no coinciden'), 'con la contraseña mal, lo dice');
      // Un mensaje igual para «ese mail no existe» y «la contraseña está mal»:
      // distinguirlos le dice a cualquiera qué mails tienen cuenta.
      verificar(
        !/no existe|no encontramos.*cuenta/i.test(conError),
        'y no deja saber si ese mail tiene cuenta'
      );
      verificar(!page.url().includes('/panel'), 'y no llega al panel');
    }
  } finally {
    await navegador.close();
  }

  console.log(fallas === 0 ? '\n✓ el despliegue anda\n' : `\n✗ ${fallas} fallas en el despliegue\n`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ la prueba se cortó:', e instanceof Error ? e.message : e);
  process.exit(1);
});
