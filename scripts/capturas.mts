/**
 * Las capturas del sistema que muestra la página comercial.
 *
 *   npm run capturas                                   # contra producción
 *   ALOJAOS_BASE=http://alojaos.test:3000 npm run capturas
 *
 * ==================================================================
 * Por qué un script y no sacarlas a mano
 * ==================================================================
 * Una captura es la única parte de la página de venta que puede quedar
 * desactualizada sin que nadie lo note: el producto cambia, la imagen se queda,
 * y la página sigue mostrando algo que ya no existe. Es exactamente la clase de
 * falla que este proyecto persigue —algo que contesta que está bien sin
 * estarlo—, sólo que en forma de PNG.
 *
 * Con esto, actualizarlas es un comando. Y como cada corrida escribe
 * `manifiesto.json` con la fecha, el commit y la dirección de la que salió cada
 * imagen, `npm run prueba:comercial` puede fallar cuando la interfaz se movió
 * después de la última captura. Una captura vieja deja de ser invisible.
 *
 * ==================================================================
 * De dónde salen
 * ==================================================================
 * Del complejo de demostración, en vivo. Tiene datos de ejemplo —se llama
 * «Cabañas del Sol» y está en «Villa Ejemplo»— y eso es a propósito: la página
 * enlaza al demo al lado de las capturas, así que cualquiera abre la dirección y
 * compara. Un enlace que se puede clickear es lo único que no se puede falsear.
 *
 * Las dos capturas del huésped salen de recorrer la pantalla de verdad: elegir
 * unidad, elegir noches, dejar los datos, reservar. La reserva que queda se
 * borra al final con la clave de servicio; si no hay clave, el script no reserva
 * y lo dice, en vez de dejar noches tomadas en el demo.
 */

import { chromium, type Locator, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { huellaDeLaInterfaz } from './huella-interfaz.mjs';

const BASE = (process.env.ALOJAOS_BASE ?? 'https://alojaos.shop').replace(/\/$/, '');
const SLUG = process.env.ALOJAOS_SLUG ?? 'cabanias-del-sol';
const DESTINO = join(process.cwd(), 'public', 'capturas');

/**
 * Las capturas que la página comercial necesita.
 *
 * Si una no sale, la corrida falla. Sin esto, un selector que cambió dejaría
 * `capturas.generado.ts` sin esa entrada, la página compilaría igual contra la
 * versión anterior del archivo, y en producción quedaría una imagen rota: una
 * corrida que termina bien y un resultado que está mal.
 */
const REQUERIDAS = [
  'huesped-eligiendo.png',
  'huesped-transferir.png',
  'panel-senas.png',
  'panel-precios.png',
  'panel-fechas.png',
];

/** El huésped de las capturas. El nombre dice qué es, para el que lo vea en la base. */
const HUESPED = 'Huésped de ejemplo';
const MAIL_HUESPED = 'capturas@ejemplo.test';

function delEnv(clave: string): string {
  try {
    return readFileSync('.env.local', 'utf-8').match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

const URL_SUPA = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? delEnv('NEXT_PUBLIC_SUPABASE_URL')).replace(/\/$/, '');
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? delEnv('SUPABASE_SERVICE_ROLE_KEY');

/** La dirección pública del complejo: el subdominio decide qué complejo se sirve. */
function direccionDelDemo(): string {
  const u = new URL(BASE);
  u.hostname = `${SLUG}.${u.hostname}`;
  return u.toString().replace(/\/$/, '');
}

const hechas: Array<{ archivo: string; de: string; que: string }> = [];

async function guardar(destino: Page | Locator, archivo: string, de: string, que: string) {
  await destino.screenshot({ path: join(DESTINO, archivo) });
  hechas.push({ archivo, de, que });
  console.log(`  ✓ ${archivo}`);
}

/** Avanza el calendario hasta el mes pedido, o avisa cuántos meses miró. */
async function irAlMes(page: Page, mes: string, saltos = 24): Promise<void> {
  const titulo = page.locator('div.mb-3 > div.text-sm');
  for (let i = 0; i < saltos; i += 1) {
    if ((await titulo.innerText()).trim().toLowerCase() === mes) return;
    await page.getByLabel('Mes siguiente').click();
    await page.waitForTimeout(60);
  }
  throw new Error(`no llegué a «${mes}» en ${saltos} meses; el calendario muestra «${(await titulo.innerText()).trim()}»`);
}

/**
 * Deja ese texto arriba de todo y captura desde ahí.
 *
 * El margen de 20 px es para que no quede pegado al borde: una captura que
 * empieza justo en el borde del texto se lee como recortada.
 */
async function arribaDeTodo(page: Page, texto: string) {
  await page.getByText(texto).first().evaluate((n) => {
    window.scrollTo({ top: window.scrollY + n.getBoundingClientRect().top - 20 });
  });
  await page.waitForTimeout(300);
}

/** El recorte de la tarjeta que contiene este título. */
function tarjetaDe(page: Page, titulo: string) {
  return page
    .getByRole('heading', { name: titulo, exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
}

async function borrarLaReservaDeLasCapturas(): Promise<string> {
  if (!URL_SUPA || !SERVICIO) return 'no hay clave de servicio: no borré nada';
  const res = await fetch(`${URL_SUPA}/rest/v1/reservas?huesped_email=eq.${encodeURIComponent(MAIL_HUESPED)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}`, Prefer: 'return=representation' },
  });
  if (!res.ok) return `NO pude borrar la reserva de las capturas: HTTP ${res.status}`;
  const borradas = (await res.json()) as unknown[];
  return `borré ${borradas.length} reserva(s) de las capturas`;
}

/**
 * Corta si en la lista de señas del demo hay alguien que no sea el huésped de
 * estas capturas.
 *
 * La pantalla de señas muestra nombre, mail y teléfono de cada huésped: una
 * captura de esa lista con una reserva que no es nuestra publica los datos de
 * esa persona en la página de venta. Pasó el 15/10 con «Prueba de Navegador»,
 * que la batería de navegador dejaba viva en producción.
 */
async function nadieAjenoEnLaLista(): Promise<void> {
  if (!URL_SUPA || !SERVICIO) {
    throw new Error(
      'Sin clave de servicio no puedo comprobar que la lista de señas sea sólo del huésped\n' +
        '   de las capturas, y sacar la foto a ciegas puede publicar datos de otra persona.'
    );
  }
  // Sólo en el complejo que se fotografía. La primera versión miraba todos, y
  // con las demos de los visitantes —cada una trae sus señas de ejemplo— no
  // habría sacado una foto nunca más.
  const cabecera = { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}` };
  const complejos = await fetch(`${URL_SUPA}/rest/v1/complejos?slug=eq.${SLUG}&select=id`, { headers: cabecera });
  const [complejo] = complejos.ok ? ((await complejos.json()) as Array<{ id: string }>) : [];
  if (!complejo) throw new Error(`no encontré el complejo ${SLUG} para revisar sus señas`);
  const res = await fetch(
    `${URL_SUPA}/rest/v1/reservas?estado=eq.HOLD_TRANSFER&complejo_id=eq.${complejo.id}` +
      `&huesped_email=neq.${encodeURIComponent(MAIL_HUESPED)}` +
      '&select=huesped_nombre,huesped_email,check_in,check_out',
    { headers: cabecera }
  );
  if (!res.ok) throw new Error(`no pude revisar las señas del demo: HTTP ${res.status}`);
  const ajenas = (await res.json()) as Array<{ huesped_nombre: string; check_in: string; check_out: string }>;
  if (ajenas.length > 0) {
    throw new Error(
      'La lista de señas tiene reservas que no son de estas capturas:\n   ' +
        ajenas.map((r) => `«${r.huesped_nombre}» ${r.check_in} → ${r.check_out}`).join('\n   ') +
        '\n   Sacar la foto así publicaría esos datos en la página de venta.' +
        '\n   Resolvelas o borralas desde el panel, y volvé a correr `npm run capturas`.'
    );
  }
}

async function main() {
  mkdirSync(DESTINO, { recursive: true });

  const demo = direccionDelDemo();
  console.log(`\nCapturas de ${demo} y ${BASE}/panel\n`);

  // La reserva de una corrida anterior tendría tomadas las noches que esta
  // corrida quiere elegir, y el día del calendario aparecería deshabilitado sin
  // explicación. Se limpia antes, no sólo después.
  console.log(`→ antes de empezar: ${await borrarLaReservaDeLasCapturas()}`);

  const raiz = new URL(BASE).hostname;
  const navegador = await chromium.launch({
    // Para una corrida local: el nombre del subdominio tiene que resolver al
    // servidor de desarrollo, que es lo que en producción hace el comodín. El
    // dominio pelado va aparte del comodín: `*.alojaos.test` no incluye a
    // `alojaos.test`, y el panel vive ahí.
    args: BASE.startsWith('http://')
      ? [`--host-resolver-rules=MAP ${raiz} 127.0.0.1, MAP *.${raiz} 127.0.0.1`]
      : [],
  });

  try {
    // ================================================================
    // Lo que ve el huésped, en un celular
    // ================================================================
    // 390 px es un iPhone de los que más entran. La mitad de la gente abre
    // esta página desde un mensaje, así que esta es la vista que importa.
    const celular = await navegador.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const huesped = await celular.newPage();
    await huesped.goto(`${demo}/`, { waitUntil: 'networkidle' });

    await irAlMes(huesped, 'enero 2027');
    // Del 16 al 23: siete noches entrando sábado, que es lo que el mínimo de
    // temporada alta del demo exige. Con menos, la pantalla avisa, y la captura
    // mostraría el aviso en vez del precio.
    await huesped.getByLabel('16 de enero de 2027', { exact: true }).click();
    await huesped.getByLabel('23 de enero de 2027', { exact: true }).click();
    await huesped.waitForTimeout(400);

    await huesped.getByLabel('Personas').fill('4');
    await huesped.getByLabel('Nombre y apellido').fill(HUESPED);
    await huesped.getByLabel('DNI').fill('30111222');
    await huesped.getByLabel('Teléfono').fill('5492230000000');
    await huesped.getByLabel('Mail').fill(MAIL_HUESPED);

    // La captura tiene que arrancar en el calendario y llegar hasta el precio.
    // `scrollIntoViewIfNeeded` deja el elemento apenas visible, así que la
    // primera versión cortaba el calendario por la mitad y el precio no entraba:
    // justo lo que la captura existe para mostrar.
    await arribaDeTodo(huesped, 'Elegí las noches');
    await guardar(huesped, 'huesped-eligiendo.png', `${demo}/`, 'El calendario, las noches elegidas y la seña');

    if (!SERVICIO) {
      console.log('  … me salto la transferencia: sin clave de servicio no podría borrar la reserva después');
    } else {
      await huesped.getByRole('button', { name: 'Reservar' }).click();
      await huesped.waitForSelector('text=Te guardamos la unidad', { timeout: 15_000 });
      await huesped.waitForTimeout(500);
      // Acá la captura arranca arriba de todo y no en el cartel: después de
      // reservar la página entra casi entera en una pantalla, y el nombre del
      // complejo arriba es parte de lo que hay que mostrar. Buscar el cartel
      // la dejaba scrolleada quince píxeles y cortaba el título al medio.
      await huesped.evaluate(() => window.scrollTo(0, 0));
      await huesped.waitForTimeout(200);
      await guardar(
        huesped,
        'huesped-transferir.png',
        `${demo}/`,
        'El plazo de la seña, el alias y el CBU para transferir'
      );

      // Subir el comprobante, para que el panel se capture con el caso bueno:
      // una seña con su comprobante a la vista y el botón para verlo.
      await huesped.getByLabel('Elegir el comprobante').setInputFiles({
        name: 'transferencia.png',
        mimeType: 'image/png',
        // Un PNG de 1×1 de verdad: el bucket filtra por tipo de archivo.
        buffer: Buffer.from(
          '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
            '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
          'hex'
        ),
      });
      await huesped.waitForTimeout(3000);
    }
    await celular.close();

    // ================================================================
    // Lo que ve el dueño, en una pantalla
    // ================================================================
    const demoJson = JSON.parse(readFileSync('.alojaos-demo.json', 'utf-8')) as {
      duenio: { email: string; clave: string };
    };

    const escritorio = await navegador.newContext({
      viewport: { width: 1180, height: 1000 },
      deviceScaleFactor: 2,
    });
    const panel = await escritorio.newPage();
    await panel.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await panel.getByLabel('Mail').fill(demoJson.duenio.email);
    await panel.getByLabel('Contraseña').fill(demoJson.duenio.clave);
    await panel.getByRole('button', { name: 'Entrar' }).click();
    await panel.waitForURL(/\/panel/, { timeout: 20_000 });
    await panel.waitForLoadState('networkidle');

    // Las señas esperando, que es la pantalla en la que el dueño decide.
    const senas = panel.getByRole('list', { name: 'Señas que esperan revisión' });
    if ((await senas.count()) > 0) {
      await senas.scrollIntoViewIfNeeded();
      await panel.waitForTimeout(200);

      // Antes de disparar: que en la lista no haya nadie más que el huésped de
      // estas capturas.
      //
      // Esto no es una precaución teórica. El 15/10 la batería de navegador
      // corrió contra producción, dejó su reserva viva —limpiaba sólo al
      // empezar— y la corrida de capturas que vino después fotografió el panel
      // con «Prueba de Navegador» adentro, con su mail y su teléfono, lista
      // para publicarse en la página de venta. La batería ya limpia al
      // terminar, pero cualquier otra cosa puede dejar una reserva en el demo:
      // la única garantía es mirar la foto antes de sacarla.
      //
      // Corta en vez de avisar porque una captura con datos ajenos no se
      // arregla mirando la consola después: se publica.
      //
      // Se le pregunta a la base y no al texto de la pantalla: la pantalla
      // habría que leerla con expresiones regulares que adivinen cuál línea es
      // un nombre, y eso se rompe el día que cambie el orden de los renglones.
      await nadieAjenoEnLaLista();

      await guardar(senas, 'panel-senas.png', `${BASE}/panel`, 'Las señas esperando, con su comprobante y su plazo');
    } else {
      console.log('  … no hay señas esperando en el demo, así que no hay captura de esa pantalla');
    }

    for (const [titulo, archivo, que] of [
      ['Precios por período', 'panel-precios.png', 'Los precios por temporada, cargados desde el panel'],
      ['Fechas cerradas', 'panel-fechas.png', 'Las fechas cerradas a mano, y el aviso de qué falta'],
    ] as const) {
      const tarjeta = tarjetaDe(panel, titulo);
      if ((await tarjeta.count()) === 0) {
        console.log(`  … no encontré la tarjeta «${titulo}» en el panel`);
        continue;
      }
      await tarjeta.first().scrollIntoViewIfNeeded();
      await panel.waitForTimeout(200);
      await guardar(tarjeta.first(), archivo, `${BASE}/panel`, que);
    }

    await escritorio.close();
  } finally {
    await navegador.close();
    console.log(`→ al terminar: ${await borrarLaReservaDeLasCapturas()}`);
  }

  const faltan = REQUERIDAS.filter((r) => !hechas.some((h) => h.archivo === r));
  if (faltan.length > 0) {
    console.error(
      `\n✗ faltan ${faltan.length} captura(s) que la página necesita: ${faltan.join(', ')}.\n` +
        '  No escribo nada: dejar el archivo a medias haría que la página compile\n' +
        '  contra la versión anterior y muestre una imagen que no está.\n'
    );
    process.exit(1);
  }

  // El manifiesto es lo que vuelve comprobable una captura: de qué dirección
  // salió, qué día, y con qué versión del código. Sin esto, una imagen en
  // `public/` es una afirmación sin fecha.
  let commit = 'sin git';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    /* un repo sin git no invalida las capturas, sólo la posibilidad de fecharlas */
  }

  const sacadasEl = new Date().toISOString();
  writeFileSync(
    join(DESTINO, 'manifiesto.json'),
    `${JSON.stringify(
      {
        sacadas_el: sacadasEl,
        commit,
        // La que contesta si las capturas siguen siendo del producto de hoy.
        // El commit queda al lado para saber de dónde salieron, pero no se
        // compara: ver `scripts/huella-interfaz.mts`.
        huella_interfaz: huellaDeLaInterfaz(),
        base: BASE,
        capturas: hechas,
      },
      null,
      2
    )}\n`
  );

  // Y el mismo dato como módulo, que es lo que importa la página.
  //
  // Podría leer el JSON en tiempo de ejecución, pero entonces una captura que
  // no se sacó sería un `undefined` a mitad de la página de venta. Siendo un
  // módulo con tipos, es un error de compilación: `npm test` se entera antes
  // que un visitante. Y las medidas salen de los PNG de verdad, así que
  // `next/image` reserva el espacio exacto y la página no salta al cargar.
  const entradas = hechas
    .map((c) => {
      const png = readFileSync(join(DESTINO, c.archivo));
      const clave = c.archivo.replace(/\.png$/, '');
      return (
        `  '${clave}': {\n` +
        `    archivo: '/capturas/${c.archivo}',\n` +
        `    ancho: ${png.readUInt32BE(16)},\n` +
        `    alto: ${png.readUInt32BE(20)},\n` +
        `    que: ${JSON.stringify(c.que)},\n` +
        `    de: ${JSON.stringify(c.de)},\n` +
        `  },`
      );
    })
    .join('\n');

  writeFileSync(
    join(process.cwd(), 'src', 'components', 'comercial', 'capturas.generado.ts'),
    '/**\n' +
      ' * Las capturas que muestra la página comercial.\n' +
      ' *\n' +
      ' * GENERADO por `npm run capturas`. Editarlo a mano no saca ninguna captura:\n' +
      ' * lo que dice acá tiene que ser lo que hay en `public/capturas/`.\n' +
      ' *\n' +
      ' * El ancho y el alto salen de los PNG, así que son los de verdad. La fecha es\n' +
      ' * la de la corrida: la página la muestra, porque una captura sin fecha es una\n' +
      ' * afirmación sobre un producto que ya puede haber cambiado.\n' +
      ' */\n\n' +
      `export const CAPTURAS_SACADAS_EL = '${sacadasEl.slice(0, 10)}';\n\n` +
      `export const CAPTURAS = {\n${entradas}\n} as const;\n`
  );

  console.log(`\n✓ ${hechas.length} capturas en public/capturas/, su manifiesto y capturas.generado.ts\n`);
  if (hechas.length === 0) process.exit(1);
}

main().catch((e) => {
  console.error('\n✗ las capturas se cortaron:', e instanceof Error ? e.message : e);
  process.exit(1);
});
