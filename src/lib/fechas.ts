/**
 * El día, visto desde un servidor que corre en UTC.
 *
 * En un sistema de reservas esto no es un detalle de presentación. El servidor
 * está en UTC y entre las 21 y las 24 de Argentina ya está en el día siguiente,
 * así que `new Date().toISOString().slice(0, 10)` devuelve mañana. Una noche mal
 * contada es una reserva superpuesta, una seña mal calculada o una temporada
 * equivocada.
 *
 * No es hipotético: en el sistema de Las Cañas está pasando hoy, en tres
 * lugares que encontré leyéndolo.
 *
 *   - el bot cotizaba desde mañana después de las 21 (corre en n8n, siempre UTC);
 *   - el panel abría en la temporada que todavía no empezó si lo abrías un
 *     30 de noviembre a las 21:30 — justo lo que el comentario de esa línea
 *     decía estar evitando;
 *   - la ocupación de la temporada contaba un día más de transcurrido.
 *
 * Todo lo de acá trabaja con el día de pared del complejo. Una fecha de reserva
 * es un día de calendario, no un instante: no tiene hora y no tiene zona.
 */

import { ZONA_HORARIA_POR_DEFECTO } from './constants';

/** YYYY-MM-DD. El formato en que viajan y se guardan todas las fechas. */
export type DiaISO = string;

const relojes = new Map<string, Intl.DateTimeFormat>();

function reloj(zona: string): Intl.DateTimeFormat {
  let f = relojes.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    relojes.set(zona, f);
  }
  return f;
}

/**
 * El día de hoy en la zona del complejo.
 *
 * Se arma con `Intl` en vez de restando horas porque el horario de verano hace
 * que el desfase no sea constante, y porque una tabla de desfases escrita a mano
 * envejece.
 */
export function hoyISO(zona: string = ZONA_HORARIA_POR_DEFECTO): DiaISO {
  const partes = reloj(zona).formatToParts(new Date());
  const tomar = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${tomar('year')}-${tomar('month')}-${tomar('day')}`;
}

/**
 * Convierte un día ISO en un `Date` anclado al mediodía local.
 *
 * `new Date('2026-03-04')` lo interpreta como medianoche UTC, que en Argentina
 * es el 3 a las 21: la fecha retrocede un día sola. El mediodía deja margen de
 * doce horas para cualquier zona y para el cambio de hora.
 */
export function aDate(dia: DiaISO): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) throw new Error(`Fecha ilegible: ${dia}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

export function aISO(fecha: Date): DiaISO {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function sumarDias(dia: DiaISO, dias: number): DiaISO {
  const f = aDate(dia);
  f.setDate(f.getDate() + dias);
  return aISO(f);
}

/**
 * Cuántas noches hay entre dos fechas.
 *
 * Se cuenta sobre los días de calendario, no sobre milisegundos: entre el
 * sábado del cambio de hora y el domingo hay 23 horas, y sigue siendo una noche.
 */
export function noches(checkIn: DiaISO, checkOut: DiaISO): number {
  const a = aDate(checkIn);
  const b = aDate(checkOut);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

/** Los días de una estadía, uno por noche. El de salida no es una noche. */
export function nochesDe(checkIn: DiaISO, checkOut: DiaISO): DiaISO[] {
  const total = noches(checkIn, checkOut);
  const dias: DiaISO[] = [];
  for (let i = 0; i < total; i += 1) dias.push(sumarDias(checkIn, i));
  return dias;
}

/** 0 = domingo … 6 = sábado. El mismo número que usa Postgres con `extract(dow)`. */
export function diaDeSemana(dia: DiaISO): number {
  return aDate(dia).getDay();
}

/**
 * Si dos estadías se pisan.
 *
 * El día de salida de una puede ser el de entrada de la otra: eso no se pisa, y
 * tratarlo como conflicto le cuesta al dueño una noche por reserva. Es la misma
 * regla que `daterange(check_in, check_out, '[)')` en la base.
 */
export function seSuperponen(
  aIn: DiaISO, aOut: DiaISO,
  bIn: DiaISO, bOut: DiaISO
): boolean {
  return aIn < bOut && bIn < aOut;
}

/** Si un tramo con `hasta` INCLUSIVO toca una estadía. */
export function tramoToca(
  desde: DiaISO, hasta: DiaISO,
  checkIn: DiaISO, checkOut: DiaISO
): boolean {
  return seSuperponen(checkIn, checkOut, desde, sumarDias(hasta, 1));
}
