/**
 * Que la marca de ningún cliente esté escrita en el código.
 *
 *   npx tsx scripts/sin-marca.ts
 *
 * Esto es el chequeo que pedía `PROMPT-generalizar.md`, pero aplicado a un
 * producto multi-inquilino en vez de a una plantilla. Allá el objetivo era "que
 * la marca viva en un solo archivo de configuración"; acá no hay archivo de
 * configuración: la identidad de cada complejo es una fila de `complejos`, y el
 * código no tiene dónde escribirla.
 *
 * Por qué vale la pena tenerlo como test y no como buena intención: en el
 * sistema del que sale esto la marca terminó en 30 archivos, el teléfono en 9 y
 * la paleta en 8, y no fue por descuido sino porque nada fallaba cuando alguien
 * la escribía. Un grep que corre con `npm test` sí falla.
 *
 * ------------------------------------------------------------------
 * Qué cuenta como infracción, y qué no
 * ------------------------------------------------------------------
 * La marca no puede ser un VALOR. Como EXPLICACIÓN sí: medio código de acá
 * tiene comentarios que dicen de dónde viene cada regla y cuál era el bug que
 * evita, y esa historia es la parte más útil de los comentarios. Borrarla para
 * que pase un grep sería romper la documentación para cuidar la métrica.
 *
 * Así que hay dos pasadas distintas:
 *
 *   1. Textos (nombre, localidad, teléfono, colores): se buscan SÓLO dentro de
 *      cadenas de texto. Un nombre de complejo en una cadena es un dato
 *      hardcodeado; en un comentario es una referencia.
 *   2. Identificadores (códigos de unidad, constantes, variables de entorno de
 *      la arquitectura vieja): se buscan en el código con los comentarios
 *      sacados. Estos no pueden aparecer ni como cadena ni como nombre, porque
 *      el problema original era justamente que `LC1` era un nombre de columna.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const CARPETAS = ['src', 'supabase', 'scripts'];
const EXTENSIONES = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.sql', '.css', '.html'];
const IGNORAR = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out']);

interface Prohibido {
  patron: RegExp;
  porque: string;
  /** 'texto' busca en cadenas; 'identificador' busca en el código sin comentarios. */
  donde: 'texto' | 'identificador';
}

const PROHIBIDOS: Prohibido[] = [
  {
    patron: /Las\s*Ca[ñn]as|lascanias|lascaniasmardecobo/i,
    donde: 'texto',
    porque: 'el nombre de un complejo va en complejos.nombre',
  },
  {
    patron: /Mar\s*de\s*Cobo/i,
    donde: 'texto',
    porque: 'la localidad va en complejos.localidad',
  },
  {
    patron: /542236882986|2236882986/,
    donde: 'texto',
    porque: 'el teléfono de contacto va en complejos.whatsapp',
  },
  {
    patron: /#DED2B9|#F5F1E9|#4A3728|#8C7662/i,
    donde: 'texto',
    porque: 'la paleta de un cliente va en complejos.color_*',
  },
  {
    patron: /\bLC[1-9]\b/,
    donde: 'identificador',
    porque:
      'los códigos de unidad los elige cada dueño y viven en unidades.codigo. ' +
      'En el sistema viejo eran hasta nombres de columna de la tabla de precios, ' +
      'y por eso un complejo con otra cantidad de unidades no entraba',
  },
  {
    patron: /TEMPORADA_ALTA/,
    donde: 'identificador',
    porque:
      'una temporada con su mínimo y sus días de entrada es una fila de ' +
      'minimos_noches, no una constante. Estaba hardcodeada en la página vieja',
  },
  {
    patron: /\bN8N_[A-Z_]+|GOOGLE_SERVICE_ACCOUNT_JSON|LC_SHEET_ID|LC_SHEET_TAB|LC_OWNER_SECRET/,
    donde: 'identificador',
    porque:
      'AlojaOS no usa n8n ni una planilla de Google: los datos están en Postgres, ' +
      'y los vencimientos y los mails los resuelven la base y la app',
  },
];

/** Las cadenas de texto de un archivo, con el número de línea de cada una. */
function cadenas(contenido: string): Array<{ linea: number; texto: string }> {
  const salida: Array<{ linea: number; texto: string }> = [];

  // Comillas de JS/TS (simples, dobles y plantillas) y de SQL (simples, donde
  // '' escapa una comilla). Los dos juegos se aplican a todos los archivos: de
  // más no molesta, y de menos deja pasar algo.
  const patrones = [
    /(['"`])(?:\\[\s\S]|(?!\1)[\s\S])*?\1/g,
    /'(?:''|[^'\n])*'/g,
  ];

  for (const patron of patrones) {
    for (const m of contenido.matchAll(patron)) {
      const antes = contenido.slice(0, m.index);
      salida.push({
        linea: antes.split('\n').length,
        texto: m[0],
      });
    }
  }
  return salida;
}

/**
 * El código sin comentarios.
 *
 * Se reemplaza por espacios en vez de borrar, así los números de línea no se
 * corren y el mensaje de error apunta al lugar de verdad.
 */
function sinComentarios(contenido: string): string {
  const enBlanco = (s: string) => s.replace(/[^\n]/g, ' ');
  return contenido
    .replace(/\/\*[\s\S]*?\*\//g, enBlanco)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, pre) => pre + enBlanco(m.slice(pre.length)))
    .replace(/--[^\n]*/g, enBlanco);
}

function archivos(dir: string): string[] {
  let salida: string[] = [];
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return [];
  }

  for (const entrada of entradas) {
    if (IGNORAR.has(entrada)) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida = salida.concat(archivos(ruta));
    else if (EXTENSIONES.some((e) => entrada.endsWith(e))) salida.push(ruta);
  }
  return salida;
}

// Este archivo es la lista de lo prohibido: nombrarlo es su trabajo.
const YO = 'scripts/sin-marca.ts';

let hallazgos = 0;

// Los dos juegos de comillas se solapan (una cadena con comilla simple la
// encuentran los dos patrones), así que el mismo hallazgo puede llegar dos
// veces. Repetirlo no agrega información y hace parecer que hay más de lo que
// hay.
const vistos = new Set<string>();

function reportar(rel: string, linea: number, encontro: string, porque: string) {
  const clave = `${rel}:${linea}:${encontro}`;
  if (vistos.has(clave)) return;
  vistos.add(clave);

  hallazgos += 1;
  console.log(`\n✗ ${rel}:${linea}`);
  console.log(`  encontró: ${encontro}`);
  console.log(`  ${porque}`);
}

for (const carpeta of CARPETAS) {
  for (const ruta of archivos(join(RAIZ, carpeta))) {
    const rel = relative(RAIZ, ruta).split('\\').join('/');
    if (rel === YO) continue;

    const contenido = readFileSync(ruta, 'utf8');
    const literales = cadenas(contenido);
    const codigo = sinComentarios(contenido).split('\n');

    for (const { patron, porque, donde } of PROHIBIDOS) {
      if (donde === 'texto') {
        for (const { linea, texto } of literales) {
          const m = new RegExp(patron.source, patron.flags.replace('g', '')).exec(texto);
          if (m) reportar(rel, linea, m[0], porque);
        }
      } else {
        codigo.forEach((linea, i) => {
          const m = new RegExp(patron.source, patron.flags.replace('g', '')).exec(linea);
          if (m) reportar(rel, i + 1, m[0], porque);
        });
      }
    }
  }
}

if (hallazgos === 0) {
  console.log('OK     ninguna marca de cliente como valor en el código');
  process.exit(0);
}

console.log(`\n${hallazgos} ${hallazgos === 1 ? 'marca' : 'marcas'} de cliente en el código.`);
console.log('La identidad de un complejo es una fila de `complejos`, no una constante.\n');
process.exit(1);
