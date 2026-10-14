/**
 * La huella de la interfaz: ¿las capturas son del producto de hoy?
 *
 * `npm run capturas` la guarda en el manifiesto y `npm run prueba:comercial` la
 * vuelve a calcular. Si no coinciden, alguien tocó una pantalla después de la
 * última corrida y las imágenes de la página de venta muestran algo que ya no
 * existe.
 *
 * ------------------------------------------------------------------
 * Por qué el contenido y no el commit
 * ------------------------------------------------------------------
 * La primera versión guardaba el commit de la corrida y comparaba
 * `commit..HEAD`. Falla sola: las capturas se sacan antes de commitear, así que
 * el commit que las trae ES uno posterior al del manifiesto, y la prueba iba a
 * dar en rojo justo después de hacer todo bien. Una prueba que falla cuando el
 * mundo está bien enseña a ignorarla.
 *
 * Un hash del contenido no tiene ese problema: no se mueve al commitear, no
 * necesita historia —anda igual en un clon sin ella— y contesta la pregunta de
 * verdad, que no es «¿hubo commits?» sino «¿la pantalla es la misma?».
 *
 * ------------------------------------------------------------------
 * Qué entra
 * ------------------------------------------------------------------
 * El producto: `src/app` y `src/components`, salvo la carpeta comercial.
 * Cambiar el texto de venta no envejece una captura del producto, y si contara,
 * esto fallaría en cada retoque de la página hasta que alguien lo apague.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CARPETAS = ['src/app', 'src/components'];
const AFUERA = ['src/components/comercial'];

function archivos(dir: string): string[] {
  let salida: string[] = [];
  for (const entrada of readdirSync(dir).sort()) {
    const ruta = join(dir, entrada);
    const rel = relative(process.cwd(), ruta).split('\\').join('/');
    if (AFUERA.some((a) => rel === a || rel.startsWith(`${a}/`))) continue;
    if (statSync(ruta).isDirectory()) salida = salida.concat(archivos(ruta));
    else if (/\.(tsx?|css)$/.test(entrada)) salida.push(rel);
  }
  return salida;
}

export function huellaDeLaInterfaz(): string {
  const h = createHash('md5');
  // El nombre entra junto con el contenido: mover una pantalla de archivo sin
  // tocar una línea también cambia la interfaz que se compila.
  for (const rel of archivos(join(process.cwd(), 'src')).sort()) {
    if (!CARPETAS.some((c) => rel.startsWith(`${c}/`))) continue;
    h.update(rel);
    h.update(readFileSync(rel));
  }
  return h.digest('hex');
}
