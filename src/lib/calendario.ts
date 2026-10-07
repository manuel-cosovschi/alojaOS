/**
 * Qué fechas se pueden pedir, y con qué condiciones.
 *
 * Portado de `getMinRule()` del sistema de Las Cañas, con un cambio de fondo:
 * allá la temporada alta estaba escrita en el código —una constante con 20/12
 * al 1/3, siete noches y entrada sólo sábado o domingo— y acá es una fila de
 * `minimos_noches` con su `dias_checkin`. Era la regla de ese complejo metida en
 * el programa.
 *
 * El orden importa y es el del original:
 *
 *   1. Un bloque fijo que toca la estadía manda sobre todo: o se toma entero o
 *      no se toma.
 *   2. Un tramo con mínimo propio que toca la estadía pisa al mínimo general.
 *      Alcanza con tocarlo: quien entra el último día de un finde largo se
 *      lleva el mismo mínimo que quien entra el primero.
 *   3. El mínimo general.
 *
 * Esto decide qué ofrecer y qué explicar en la pantalla. Lo que vale es
 * `crear_reserva()` en la base, que valida lo mismo antes de escribir: un
 * navegador puede tener la página vieja en caché o puede no ser un navegador.
 */

import { type DiaISO, diaDeSemana, noches, seSuperponen, sumarDias, tramoToca } from './fechas';

export interface BloqueFijo {
  check_in: DiaISO;
  check_out: DiaISO;
  etiqueta?: string | null;
}

export interface MinimoNoches {
  desde: DiaISO;
  /** Inclusivo. */
  hasta: DiaISO;
  noches: number;
  etiqueta?: string | null;
  /** 0 = domingo … 6 = sábado. null = cualquier día. */
  dias_checkin?: number[] | null;
}

export interface ConfigCalendario {
  primera_fecha: DiaISO | null;
  /** La última NOCHE reservable. */
  ultima_fecha: DiaISO;
  minimo_noches: number;
}

export interface Reglas {
  config: ConfigCalendario;
  bloques: BloqueFijo[];
  minimos: MinimoNoches[];
  /** Hoy en la zona del complejo. Se pasa en vez de calcularlo acá para que sea testeable. */
  hoy: DiaISO;
}

export type Veredicto =
  | { ok: true; noches: number; minimo: number }
  | { ok: false; motivo: Motivo; mensaje: string; bloque?: BloqueFijo; minimo?: number; diasPermitidos?: number[] };

export type Motivo =
  | 'fechas_invalidas'
  | 'antes_de_la_ventana'
  | 'despues_de_la_ventana'
  | 'bloque_fijo'
  | 'pocas_noches'
  | 'dia_de_entrada';

const DMY = (dia: DiaISO) => {
  const [y, m, d] = dia.split('-');
  return `${d}/${m}/${y}`;
};

const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** La primera fecha que se puede pedir: la que fijó el dueño, nunca antes de hoy. */
export function primerCheckInPosible(reglas: Reglas): DiaISO {
  const fijada = reglas.config.primera_fecha;
  return fijada && fijada > reglas.hoy ? fijada : reglas.hoy;
}

/** El bloque fijo que toca esta estadía, si hay alguno. */
export function bloqueQueToca(reglas: Reglas, checkIn: DiaISO, checkOut: DiaISO): BloqueFijo | null {
  return (
    reglas.bloques.find((b) => seSuperponen(checkIn, checkOut, b.check_in, b.check_out)) ?? null
  );
}

/**
 * El mínimo que aplica a esta estadía y los días de entrada permitidos.
 *
 * Los tramos no se pueden solapar (lo impide una restricción en la base), así
 * que hay como mucho uno. El original tomaba el máximo entre la temporada alta
 * y el tramo cargado justamente porque allá podían convivir; acá no hace falta.
 */
export function minimoPara(
  reglas: Reglas,
  checkIn: DiaISO,
  checkOut: DiaISO
): { noches: number; dias: number[] | null; etiqueta: string | null } {
  const tramo = reglas.minimos.find((m) => tramoToca(m.desde, m.hasta, checkIn, checkOut));
  if (tramo) {
    return {
      noches: tramo.noches,
      dias: tramo.dias_checkin ?? null,
      etiqueta: tramo.etiqueta ?? null,
    };
  }
  return { noches: reglas.config.minimo_noches, dias: null, etiqueta: null };
}

/** Si estas fechas se pueden pedir. */
export function validar(reglas: Reglas, checkIn: DiaISO, checkOut: DiaISO): Veredicto {
  if (!checkIn || !checkOut || checkIn >= checkOut) {
    return {
      ok: false,
      motivo: 'fechas_invalidas',
      mensaje: 'La fecha de salida tiene que ser posterior a la de entrada.',
    };
  }

  const desde = primerCheckInPosible(reglas);
  if (checkIn < desde) {
    return {
      ok: false,
      motivo: 'antes_de_la_ventana',
      mensaje: `Se puede reservar desde el ${DMY(desde)}.`,
    };
  }

  // `ultima_fecha` es la última noche, así que la última salida es el día
  // siguiente. Comparar el check-out contra la última noche le robaría una.
  if (checkOut > sumarDias(reglas.config.ultima_fecha, 1)) {
    return {
      ok: false,
      motivo: 'despues_de_la_ventana',
      mensaje: `Por el momento sólo se puede reservar hasta el ${DMY(reglas.config.ultima_fecha)}.`,
    };
  }

  const bloque = bloqueQueToca(reglas, checkIn, checkOut);
  if (bloque && !(checkIn === bloque.check_in && checkOut === bloque.check_out)) {
    return {
      ok: false,
      motivo: 'bloque_fijo',
      mensaje: `Esas fechas son parte de un bloque que se alquila completo: ${DMY(bloque.check_in)} al ${DMY(bloque.check_out)}.`,
      bloque,
    };
  }

  const total = noches(checkIn, checkOut);
  const minimo = minimoPara(reglas, checkIn, checkOut);

  // Un bloque fijo tomado entero vale por su propia duración, aunque sea menor
  // que el mínimo del tramo: el dueño lo cargó así a propósito.
  if (!bloque && total < minimo.noches) {
    const porque = minimo.etiqueta ? ` por ${minimo.etiqueta}` : '';
    return {
      ok: false,
      motivo: 'pocas_noches',
      mensaje: `Para esas fechas el mínimo es de ${minimo.noches} noches${porque}.`,
      minimo: minimo.noches,
    };
  }

  if (!bloque && minimo.dias && !minimo.dias.includes(diaDeSemana(checkIn))) {
    const nombres = minimo.dias.map((d) => NOMBRE_DIA[d]).join(' o ');
    return {
      ok: false,
      motivo: 'dia_de_entrada',
      mensaje: `Para esas fechas la entrada es ${nombres}.`,
      diasPermitidos: minimo.dias,
    };
  }

  return { ok: true, noches: total, minimo: bloque ? total : minimo.noches };
}

