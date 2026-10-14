/**
 * El contraste de WCAG, y que coincida con la versión de la base.
 *
 *   npx tsx src/lib/__tests__/contraste.manual.mts
 *
 * ------------------------------------------------------------------
 * Para qué sirve esta prueba en particular
 * ------------------------------------------------------------------
 * La misma cuenta existe dos veces: acá, para que la vista previa del panel
 * avise mientras el dueño mueve el color, y en la base, en `contraste_wcag()`
 * (migración 021), que es la que decide al guardar.
 *
 * Dos implementaciones de la misma cosa se separan tarde o temprano. Lo que
 * impide que eso pase en silencio es que las dos pruebas —ésta y el bloque 20
 * de `scripts/prueba-base.sql`— afirman **los mismos valores**. Si una de las
 * dos implementaciones se desviara, una de las dos pruebas falla.
 *
 * Los valores elegidos no son arbitrarios: son los que se pueden verificar sin
 * confiar en ninguna de las dos implementaciones.
 *
 *   · negro sobre blanco es 21, el máximo que define la especificación;
 *   · cualquier color contra sí mismo es 1, el mínimo;
 *   · y la relación es simétrica, porque la fórmula toma el mayor y el menor.
 */

import {
  contraste,
  luminanciaRelativa,
  normalizarHex,
  CONTRASTE_MINIMO,
} from '../contraste.js';

let fallas = 0;
const igual = (real: unknown, esperado: unknown, nombre: string) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(
    `${ok ? 'OK    ' : 'FALLA '} ${nombre}` +
      (ok ? '' : `  [esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}]`)
  );
};

// ---------------------------------------------------------------------------
// Los dos extremos de la especificación
// ---------------------------------------------------------------------------
// Estas dos son las que atan esta implementación a la de la base: el bloque 20
// de prueba-base.sql afirma exactamente lo mismo.
igual(contraste('#000000', '#ffffff'), 21, 'negro sobre blanco da 21, el máximo');
igual(contraste('#7f7f7f', '#7f7f7f'), 1, 'un color contra sí mismo da 1');
igual(
  contraste('#1f2937', '#f8f7f4') === contraste('#f8f7f4', '#1f2937'),
  true,
  'y da lo mismo en cualquier orden'
);

// Los colores por omisión del producto tienen que ser legibles. Si alguien los
// cambia en `globals.css` y quedan por debajo de 4.5, esto lo dice.
igual(
  (contraste('#111827', '#f8f7f4') ?? 0) >= CONTRASTE_MINIMO,
  true,
  'los colores por omisión de AlojaOS pasan el mínimo de WCAG'
);

// ---------------------------------------------------------------------------
// La luminancia, en los dos extremos
// ---------------------------------------------------------------------------
igual(luminanciaRelativa('#000000'), 0, 'el negro tiene luminancia 0');
igual(luminanciaRelativa('#ffffff'), 1, 'y el blanco, 1');

// ---------------------------------------------------------------------------
// Lo que no es un color
// ---------------------------------------------------------------------------
// Devuelve null y no un número: un contraste inventado sobre una entrada que no
// se entendió haría que la pantalla diga que está todo bien sin estarlo.
igual(contraste('rojo', '#ffffff'), null, 'un nombre de color no da un número');
igual(contraste('#fff', '#000'), 21, 'pero el hexadecimal corto sí, normalizado');
igual(contraste('', '#000000'), null, 'una cadena vacía tampoco');
igual(contraste('#12345', '#000000'), null, 'ni un hexadecimal de cinco dígitos');

// ---------------------------------------------------------------------------
// La normalización, que tiene que dar lo mismo que la de la base
// ---------------------------------------------------------------------------
igual(normalizarHex('#ABC'), '#aabbcc', '#ABC se normaliza a #aabbcc');
igual(normalizarHex('  #1F2937  '), '#1f2937', 'y se le sacan los espacios');
igual(normalizarHex('#1f29'), null, 'cuatro dígitos no es un color');
igual(normalizarHex('url(x)'), null, 'ni un url()');

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
