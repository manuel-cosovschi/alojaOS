/**
 * Cuánto sale una estadía.
 *
 * Esto es la misma cuenta que hace `cotizar_estadia()` en la base, a propósito
 * repetida: la página necesita mostrar el precio mientras la persona elige
 * fechas, sin una ida y vuelta por noche. La que vale es la de la base — es la
 * que se guarda en la reserva — y esta es para que la pantalla no mienta.
 *
 * Las tres reglas, portadas de `calcStayTotal()` del sistema de Las Cañas:
 *
 *   1. `hasta` es INCLUSIVO: es la última noche que se cobra a ese precio.
 *   2. Cada noche se cobra según SU PROPIA fecha. Una estadía que cruza de
 *      temporada media a alta paga parte a cada precio.
 *   3. Una noche sin precio cargado NO se cotiza. No se saltea ni se le inventa
 *      un precio: la estadía entera queda sin cotizar y se le pide a la persona
 *      que espere la confirmación. El comentario original lo dice mejor: cobrar
 *      de menos sin que nadie se entere es peor que hacerla esperar.
 */

import { type DiaISO, nochesDe } from './fechas';

export interface PeriodoPrecio {
  desde: DiaISO;
  /** Inclusivo. */
  hasta: DiaISO;
  etiqueta?: string | null;
  /** Precio por noche, por código de unidad. */
  precios: Record<string, number>;
}

export interface Cotizacion {
  noches: number;
  total: number;
  sena: number;
  precioMin: number;
  precioMax: number;
}

/** El precio de una noche, o null si no hay período que la cubra. */
export function precioDeLaNoche(
  dia: DiaISO,
  unidad: string,
  periodos: PeriodoPrecio[]
): number | null {
  for (const p of periodos) {
    if (dia >= p.desde && dia <= p.hasta) {
      const precio = p.precios?.[unidad];
      if (Number.isFinite(precio) && (precio as number) > 0) return precio as number;
      // El período cubre la noche pero no tiene precio para esta unidad: es lo
      // mismo que no tenerlo. Seguir buscando daría el precio de otro período,
      // que es peor que no dar ninguno.
      return null;
    }
  }
  return null;
}

/**
 * Cotiza la estadía, o devuelve null si alguna noche no tiene precio.
 *
 * `porcentajeSena` sale del complejo (50 en Las Cañas, pero es un dato del
 * cliente, no una constante del producto).
 */
export function cotizar(
  checkIn: DiaISO,
  checkOut: DiaISO,
  unidad: string,
  periodos: PeriodoPrecio[],
  porcentajeSena: number
): Cotizacion | null {
  const dias = nochesDe(checkIn, checkOut);
  if (dias.length === 0) return null;

  let total = 0;
  let precioMin = Infinity;
  let precioMax = -Infinity;

  for (const dia of dias) {
    const precio = precioDeLaNoche(dia, unidad, periodos);
    if (precio == null) return null;
    total += precio;
    if (precio < precioMin) precioMin = precio;
    if (precio > precioMax) precioMax = precio;
  }

  return {
    noches: dias.length,
    total,
    sena: Math.round((total * porcentajeSena) / 100),
    precioMin,
    precioMax,
  };
}

/** Qué noche de la estadía no tiene precio. Para decírselo al dueño, no al huésped. */
export function primeraNocheSinPrecio(
  checkIn: DiaISO,
  checkOut: DiaISO,
  unidad: string,
  periodos: PeriodoPrecio[]
): DiaISO | null {
  for (const dia of nochesDe(checkIn, checkOut)) {
    if (precioDeLaNoche(dia, unidad, periodos) == null) return dia;
  }
  return null;
}
