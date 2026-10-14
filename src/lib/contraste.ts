/**
 * El contraste entre dos colores, según WCAG 2.1.
 *
 * ------------------------------------------------------------------
 * Esto está en dos lugares a propósito, y por eso está probado en los dos
 * ------------------------------------------------------------------
 * La misma cuenta existe en la base, en `contraste_wcag()` (migración 021).
 * Normalmente eso sería un problema: dos implementaciones de la misma regla son
 * dos cosas que tienen que estar de acuerdo, y tarde o temprano no lo están.
 *
 * Acá se acepta por una razón concreta: la pantalla de la marca muestra el aviso
 * de legibilidad **mientras el dueño mueve el color**, antes de guardar. Con la
 * cuenta sólo en la base, el aviso llegaría un guardado tarde, que para elegir
 * un color es inútil.
 *
 * Y se acepta porque no es una regla del negocio que alguien decidió: es una
 * fórmula de una especificación, que no cambia. Lo que puede diferir es un bug
 * en una de las dos, así que las dos pruebas —`src/lib/__tests__` y el bloque 20
 * de `prueba-base.sql`— afirman los MISMOS valores conocidos. Si una se
 * desviara, una de las dos falla.
 *
 * Quien decide al guardar es la base. Esto es para la vista previa.
 */

/** El mínimo de WCAG para texto normal. */
export const CONTRASTE_MINIMO = 4.5;

/** El mínimo de WCAG para texto grande (18pt, o 14pt en negrita). */
export const CONTRASTE_MINIMO_GRANDE = 3;

/** `#abc` → `#aabbcc`. Null si no es un hexadecimal de 3 o 6. */
export function normalizarHex(valor: string): string | null {
  const v = (valor ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return null;
}

/** La luminancia relativa de un color, de 0 (negro) a 1 (blanco). */
export function luminanciaRelativa(hex: string): number | null {
  const v = normalizarHex(hex);
  if (v === null) return null;

  const canales = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  // La corrección de gamma de sRGB, tal cual la define WCAG.
  const lineal = canales.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));

  return 0.2126 * lineal[0] + 0.7152 * lineal[1] + 0.0722 * lineal[2];
}

/**
 * La relación de contraste entre dos colores: de 1 (iguales) a 21 (negro y
 * blanco). Null si alguno no es un hexadecimal.
 *
 * Redondeado a dos decimales igual que la versión de la base, para que comparar
 * las dos salidas sea comparar números y no interpretaciones.
 */
export function contraste(a: string, b: string): number | null {
  const la = luminanciaRelativa(a);
  const lb = luminanciaRelativa(b);
  if (la === null || lb === null) return null;

  const bruto = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  return Math.round(bruto * 100) / 100;
}
