/**
 * ¿Qué puede leer y escribir un visitante cualquiera?
 *
 *   npx tsx scripts/aislamiento.ts
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… npx tsx scripts/aislamiento.ts
 *
 * Esto no prueba el código: le pega a la base de verdad con la clave anónima,
 * que es la que viaja en el navegador de cualquiera que entre a la página de
 * reservas de un complejo. Es la única forma de comprobar que las policies, los
 * GRANT y los REVOKE siguen haciendo lo que creemos, porque cualquiera de los
 * tres se puede caer solo: una policy nueva de más, un GRANT que vuelve con una
 * migración, una tabla agregada sin RLS.
 *
 * En este producto, que esto falle es lo peor que puede pasar. No es "se filtra
 * un precio": son las reservas de un complejo —con nombre, teléfono, DNI y mail
 * de cada huésped— a la vista de otro complejo, o de cualquiera. Conviene
 * correrlo después de cada migración.
 *
 * Que una tabla privada conteste "permission denied" en vez de cero filas es
 * mejor, no peor: significa que el rol anónimo no tiene ni el permiso de tabla,
 * así que ni siquiera se evalúa la policy. Las dos respuestas pasan.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function delEnv(clave: string): string | undefined {
  try {
    const archivo = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    return archivo.match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}

const URL_BASE = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  delEnv('NEXT_PUBLIC_SUPABASE_URL') ||
  ''
).replace(/\/$/, '');

const ANON =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  delEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  '';

if (!URL_BASE || !ANON) {
  console.error(
    '\n✗ Faltan la URL del proyecto y la clave anónima.\n' +
      '  Cargalas en .env.local (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)\n' +
      '  o pasalas como SUPABASE_URL / SUPABASE_ANON_KEY.\n'
  );
  process.exit(1);
}

const CABECERAS = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };

// La clave de servicio es opcional: sin ella se corre la mitad de arriba, que
// es la que importa. Con ella se puede comprobar la otra mitad, que es casi
// igual de importante y nadie mira: que el servidor SÍ pueda hacer lo que el
// producto necesita. Un REVOKE de más deja al visitante bien aislado y al
// sistema sin poder guardar un comprobante.
const SERVICIO =
  process.env.SUPABASE_SERVICE_ROLE_KEY || delEnv('SUPABASE_SERVICE_ROLE_KEY') || '';

const CABECERAS_SERVICIO = {
  apikey: SERVICIO,
  Authorization: `Bearer ${SERVICIO}`,
  'Content-Type': 'application/json',
};

/**
 * Un JPEG de 1x1, entero y válido.
 *
 * Tiene que ser un archivo real del tipo que el bucket acepta: con cualquier
 * otra cosa la subida rebota por el tipo y la prueba no distingue "no tengo
 * permiso" de "no me gusta el archivo".
 */
const JPEG_MINIMO = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDI0NP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAAB' +
      'BQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFB' +
      'BhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RV' +
      'VldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrC' +
      'w8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A/v4oooA/' +
      '/9k='
  ),
  (c) => c.charCodeAt(0)
);

let fallas = 0;

function ok(nombre: string, detalle = '') {
  console.log(`OK     ${nombre}${detalle ? `  (${detalle})` : ''}`);
}
function falla(nombre: string, detalle: string) {
  fallas += 1;
  console.log(`FALLA  ${nombre}\n       ${detalle}`);
}

async function rest(path: string, init?: RequestInit, comoServicio = false) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: comoServicio ? CABECERAS_SERVICIO : CABECERAS,
  });
  let cuerpo: unknown = null;
  try {
    cuerpo = await res.json();
  } catch {
    /* algunas respuestas vienen vacías */
  }
  return { status: res.status, cuerpo };
}

/** Una tabla que el visitante NO puede leer: ni filas ni permiso. */
async function noPuedeLeer(tabla: string) {
  const { status, cuerpo } = await rest(`${tabla}?select=*&limit=1`);

  // 401/403/404 = no tiene permiso ni ve la tabla. Perfecto.
  if (status === 401 || status === 403 || status === 404) {
    return ok(`no puede leer ${tabla}`, `HTTP ${status}`);
  }

  if (status === 200 && Array.isArray(cuerpo)) {
    if (cuerpo.length === 0) return ok(`no puede leer ${tabla}`, '0 filas');
    return falla(
      `no puede leer ${tabla}`,
      `devolvió ${cuerpo.length} fila(s): ${JSON.stringify(cuerpo[0]).slice(0, 200)}`
    );
  }

  return ok(`no puede leer ${tabla}`, `HTTP ${status}`);
}

/** Una tabla en la que el visitante NO puede escribir. */
async function noPuedeEscribir(tabla: string, fila: Record<string, unknown>) {
  const { status, cuerpo } = await rest(tabla, { method: 'POST', body: JSON.stringify(fila) });

  if (status === 200 || status === 201) {
    return falla(`no puede escribir en ${tabla}`, `la escritura entró: ${JSON.stringify(cuerpo).slice(0, 200)}`);
  }
  return ok(`no puede escribir en ${tabla}`, `HTTP ${status}`);
}

/** Una función que el visitante NO puede ejecutar. */
async function noPuedeEjecutar(fn: string, args: Record<string, unknown> = {}) {
  const { status, cuerpo } = await rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

  if (status === 200) {
    return falla(`no puede ejecutar ${fn}()`, `devolvió: ${JSON.stringify(cuerpo).slice(0, 200)}`);
  }
  return ok(`no puede ejecutar ${fn}()`, `HTTP ${status}`);
}

async function main() {
  console.log(`\nAislamiento contra ${URL_BASE}\ncon la clave anónima, la que viaja en el navegador.\n`);

  console.log('— Lo privado de cada complejo —');
  // Esta es LA prueba del producto. Una reserva tiene nombre, DNI, teléfono y
  // mail de una persona que no es el visitante.
  await noPuedeLeer('reservas');
  await noPuedeLeer('complejos');
  await noPuedeLeer('unidades');
  await noPuedeLeer('complejo_miembros');
  await noPuedeLeer('periodos_precio');
  await noPuedeLeer('precios_unidad');
  await noPuedeLeer('config_calendario');
  await noPuedeLeer('bloques_fijos');
  await noPuedeLeer('minimos_noches');
  await noPuedeLeer('objetivos_temporada');

  console.log('\n— Escribir —');
  await noPuedeEscribir('reservas', {
    complejo_id: '00000000-0000-0000-0000-000000000000',
    unidad_id: '00000000-0000-0000-0000-000000000000',
    check_in: '2030-01-01',
    check_out: '2030-01-02',
  });
  await noPuedeEscribir('complejos', { slug: 'colado', nombre: 'Colado' });
  await noPuedeEscribir('objetivos_temporada', {
    complejo_id: '00000000-0000-0000-0000-000000000000',
    temporada: 2030,
    objetivo: 1,
  });
  // El precio es lo que se le pide transferir a alguien: si el visitante lo
  // pudiera escribir, se pondría la temporada alta a un peso.
  await noPuedeEscribir('periodos_precio', {
    complejo_id: '00000000-0000-0000-0000-000000000000',
    desde: '2030-01-01',
    hasta: '2030-01-31',
  });

  console.log('\n— Funciones que no son para el visitante —');
  // Soltar los holds vencidos es una escritura: desde afuera sería una forma de
  // liberarle las noches a otro.
  await noPuedeEjecutar('liberar_vencidas');

  console.log('\n— Lo que SÍ tiene que poder —');
  // La página de un complejo tiene que cargar. Si esto falla, el producto no
  // funciona; es la otra mitad del chequeo.
  {
    const { status, cuerpo } = await rest('rpc/complejo_publico', {
      method: 'POST',
      body: JSON.stringify({ p_slug: '__no-existe__' }),
    });
    if (status === 200) ok('puede leer la página pública de un complejo', `HTTP ${status}, slug inexistente → ${JSON.stringify(cuerpo)}`);
    else falla('puede leer la página pública de un complejo', `HTTP ${status}: ${JSON.stringify(cuerpo).slice(0, 200)}`);
  }

  // Las fechas ocupadas son públicas; quién las ocupa, no. Que esta función
  // conteste está bien: lo que no puede es traer datos del huésped, y no los
  // trae porque no los nombra.
  {
    const { status } = await rest('rpc/noches_ocupadas', {
      method: 'POST',
      body: JSON.stringify({ p_complejo: '00000000-0000-0000-0000-000000000000' }),
    });
    if (status === 200) ok('puede consultar las noches ocupadas');
    else falla('puede consultar las noches ocupadas', `HTTP ${status}`);
  }

  // ------------------------------------------------------------------
  // El otro lado: que el servidor sí pueda
  // ------------------------------------------------------------------
  if (!SERVICIO) {
    console.log(
      '\n— La clave de servicio —\n' +
        'No está cargada (SUPABASE_SERVICE_ROLE_KEY), así que no comprobé lo del\n' +
        'servidor: registrar un comprobante y escribir en el bucket privado. Eso\n' +
        'queda sin verificar, no verificado y bien.'
    );
  } else {
    console.log('\n— La clave de servicio, que es la otra mitad —');

    // Una clave de servicio que no pasa por encima de RLS se nota acá y en
    // ningún otro lado: la página sigue andando, y los comprobantes no se
    // guardan. Es el bug del sistema anterior, con otra causa.
    {
      const { status, cuerpo } = await rest('complejos?select=id&limit=1', undefined, true);
      if (status === 200 && Array.isArray(cuerpo)) ok('el servidor lee `complejos` (pasa por encima de RLS)');
      else falla('el servidor lee `complejos`', `HTTP ${status}: ${JSON.stringify(cuerpo).slice(0, 200)}`);
    }

    // La función que escribe la ruta del comprobante. Con un id inexistente
    // tiene que contestar `no_existe`: eso prueba que ENTRÓ a la función, que
    // es lo que se está comprobando. Un 401 o un 403 serían una clave que no
    // sirve, y el huésped vería "no pudimos guardarlo" para siempre.
    {
      const { status, cuerpo } = await rest(
        'rpc/registrar_comprobante',
        {
          method: 'POST',
          body: JSON.stringify({
            p_reserva: '00000000-0000-0000-0000-000000000000',
            p_path: 'aislamiento/prueba.jpg',
          }),
        },
        true
      );
      const motivo = (cuerpo as { motivo?: string } | null)?.motivo;
      if (status === 200 && motivo === 'no_existe') {
        ok('el servidor puede llamar registrar_comprobante()', 'contestó no_existe, que es entrar');
      } else {
        falla(
          'el servidor puede llamar registrar_comprobante()',
          `HTTP ${status}: ${JSON.stringify(cuerpo).slice(0, 200)}`
        );
      }
    }

    // El almacenamiento. El bucket es privado y no tiene ninguna policy, así
    // que el único que puede escribirlo es éste. Si no pudiera, ningún
    // comprobante se guardaría nunca —exactamente lo que pasó antes—.
    {
      // Un JPEG de verdad, del tipo que el bucket acepta. Con un .txt la
      // subida rebota por el tipo y no se prueba nada: la respuesta sería la
      // misma con una clave que no sirve. Hay que subir algo que TIENE que
      // entrar, y que entre.
      const ruta = `aislamiento/${Date.now()}.jpg`;
      const subida = await fetch(`${URL_BASE}/storage/v1/object/comprobantes/${ruta}`, {
        method: 'POST',
        headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}`, 'Content-Type': 'image/jpeg' },
        body: JPEG_MINIMO,
      });

      if (!subida.ok) {
        falla(
          'el servidor escribe el bucket privado',
          `HTTP ${subida.status}: ${(await subida.text()).slice(0, 200)}`
        );
      } else {
        // Y que esté: el 200 de la subida es lo que contestó el servicio, no
        // una comprobación de que el archivo quedó. Se lo vuelve a pedir.
        const bajada = await fetch(`${URL_BASE}/storage/v1/object/comprobantes/${ruta}`, {
          headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}` },
        });
        const bytes = new Uint8Array(await bajada.arrayBuffer());
        const igual =
          bajada.ok && bytes.length === JPEG_MINIMO.length && bytes.every((b, i) => b === JPEG_MINIMO[i]);
        if (igual) ok('el servidor escribe el bucket privado, y el archivo queda', ruta);
        else falla('el archivo que subió el servidor se puede volver a leer',
                   `HTTP ${bajada.status}, ${bytes.length} bytes de ${JPEG_MINIMO.length}`);

        await fetch(`${URL_BASE}/storage/v1/object/comprobantes/${ruta}`, {
          method: 'DELETE',
          headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}` },
        });
      }
    }

    // Y el visitante no. Mismo endpoint, mismo archivo, otra clave: así lo
    // único que cambia es el permiso.
    //
    // Y se mira el MOTIVO, no sólo el código. Un 400 puede ser por el tipo del
    // archivo, por el tamaño o por el permiso, y si fuera por el tipo esta
    // prueba estaría pasando por la razón equivocada: diría que el visitante
    // no puede escribir cuando en realidad no probó el permiso.
    {
      const subida = await fetch(`${URL_BASE}/storage/v1/object/comprobantes/colado.jpg`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'image/jpeg' },
        body: JPEG_MINIMO,
      });
      const cuerpo = await subida.text();

      if (subida.ok) {
        falla('el visitante NO puede escribir el bucket', `HTTP ${subida.status}: entró`);
      } else if (/unauthorized|not authorized|row-level security|violates|permission|signature|jwt/i.test(cuerpo)) {
        ok('el visitante no puede escribir el bucket', `HTTP ${subida.status}, por permiso`);
      } else {
        falla(
          'el visitante no puede escribir el bucket POR PERMISO',
          `rebotó con HTTP ${subida.status} pero por otro motivo: ${cuerpo.slice(0, 200)}`
        );
      }
    }
  }

  console.log(
    fallas === 0
      ? '\n✓ El visitante ve sólo lo público, y el servidor puede lo que tiene que poder.\n'
      : `\n✗ ${fallas} ${fallas === 1 ? 'problema' : 'problemas'} de aislamiento.\n`
  );
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ Error inesperado:', e);
  process.exit(1);
});
