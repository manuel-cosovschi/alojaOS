/**
 * A qué temporada pertenece una fecha.
 *
 * Una temporada se identifica por el año en que ARRANCA: la 2026-2027 es 2026.
 *
 * En Las Cañas esto era `temporadaDe()` en admin.html, con diciembre escrito
 * como constante: `m === 12 ? a : a - 1`. Para un complejo de montaña la
 * temporada es el invierno, así que el mes de arranque es un dato del complejo.
 *
 * El día que se le pase nunca sale de `new Date()` acá adentro: lo pasa quien
 * llama, con `hoyISO(zona)`. Ese es justo el bug que tiene el panel de Las
 * Cañas: `temporadaDe(new Date().toISOString().slice(0,10))` un 30 de noviembre
 * a las 21:30 devuelve la temporada que todavía no empezó.
 */

import type { DiaISO } from './fechas';

export function temporadaDe(dia: DiaISO, mesInicio: number): number {
  const [anio, mes] = dia.split('-').map(Number);
  if (!anio || !mes) throw new Error(`Fecha ilegible: ${dia}`);
  return mes >= mesInicio ? anio : anio - 1;
}

/** "Temporada 26-27", o "Temporada 2026" si arranca en enero y no cruza el año. */
export function nombreTemporada(inicio: number, mesInicio: number): string {
  if (mesInicio === 1) return `Temporada ${inicio}`;
  const dos = (n: number) => String(n).slice(2);
  return `Temporada ${dos(inicio)}-${dos(inicio + 1)}`;
}

/** El primer y el último día de una temporada. */
export function rangoTemporada(inicio: number, mesInicio: number): { desde: DiaISO; hasta: DiaISO } {
  const mm = String(mesInicio).padStart(2, '0');
  const desde = `${inicio}-${mm}-01`;

  // El día antes del arranque de la siguiente. Se calcula así y no con una
  // tabla de días por mes para no tener que acordarse de los años bisiestos.
  const siguiente = new Date(mesInicio === 1 ? inicio + 1 : inicio + 1, mesInicio - 1, 1, 12, 0, 0);
  siguiente.setDate(siguiente.getDate() - 1);
  const y = siguiente.getFullYear();
  const m = String(siguiente.getMonth() + 1).padStart(2, '0');
  const d = String(siguiente.getDate()).padStart(2, '0');

  return { desde, hasta: `${y}-${m}-${d}` };
}
