/**
 * Cotizar una estadía.
 *
 *   npx tsx src/lib/__tests__/precios.manual.mts
 *
 * Las dos cosas que se prueban acá ya salieron mal una vez en el sistema de
 * Las Cañas, y están documentadas en el repo:
 *
 *   - El bot de WhatsApp cotizaba contra un endpoint que devolvía una lista de
 *     precios sin fechas, así que contestaba lo mismo para agosto que para el 2
 *     de enero: a diez noches de enero les cotizó menos de la mitad.
 *   - Una noche sin período cargado no puede cotizarse "salteándola", porque
 *     entonces diez noches con dos sin precio salen como ocho.
 */

import { cotizar, precioDeLaNoche, primeraNocheSinPrecio, type PeriodoPrecio } from '../precios.js';

let fallas = 0;
const igual = (real: unknown, esperado: unknown, nombre: string) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(
    `${ok ? 'OK    ' : 'FALLA '} ${nombre}` +
      (ok ? '' : `  [esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}]`)
  );
};

// Dos temporadas pegadas, como las carga un dueño: "del 1 al 31 de diciembre" y
// "del 1 de enero al 28 de febrero". `hasta` inclusivo.
const PERIODOS: PeriodoPrecio[] = [
  { desde: '2026-12-01', hasta: '2026-12-19', etiqueta: 'media', precios: { A: 80000, B: 60000 } },
  { desde: '2026-12-20', hasta: '2027-02-28', etiqueta: 'alta',  precios: { A: 150000, B: 110000 } },
];

// ---------------------------------------------------------------------------
// `hasta` es inclusivo
// ---------------------------------------------------------------------------
igual(precioDeLaNoche('2026-12-19', 'A', PERIODOS), 80000, 'el 19 todavía es temporada media');
igual(precioDeLaNoche('2026-12-20', 'A', PERIODOS), 150000, 'el 20 ya es alta');
igual(precioDeLaNoche('2027-02-28', 'A', PERIODOS), 150000, 'el último día del período se cobra');
igual(precioDeLaNoche('2027-03-01', 'A', PERIODOS), null, 'el 1 de marzo no tiene período');

// ---------------------------------------------------------------------------
// Cada noche según su propia fecha
// ---------------------------------------------------------------------------
// Del 18 al 22 de diciembre: 18 y 19 a precio medio, 20 y 21 a precio alto.
// Son cuatro noches y el total NO es cuatro veces ningún precio.
igual(
  cotizar('2026-12-18', '2026-12-22', 'A', PERIODOS, 50),
  { noches: 4, total: 80000 + 80000 + 150000 + 150000, sena: 230000, precioMin: 80000, precioMax: 150000 },
  'una estadía que cruza de temporada paga parte a cada precio'
);

// Esto es exactamente lo que el bot hacía mal: cotizar toda la estadía al
// precio de la primera noche habría dado 320000 en vez de 460000.
igual(
  cotizar('2026-12-18', '2026-12-22', 'A', PERIODOS, 50)?.total !== 4 * 80000,
  true,
  'y no es la primera noche multiplicada por la cantidad'
);

// Diez noches de enero, el caso del bug del bot.
igual(
  cotizar('2027-01-05', '2027-01-15', 'A', PERIODOS, 50),
  { noches: 10, total: 1500000, sena: 750000, precioMin: 150000, precioMax: 150000 },
  'diez noches de enero salen diez veces el precio de enero'
);

// ---------------------------------------------------------------------------
// Una noche sin precio deja la estadía sin cotizar
// ---------------------------------------------------------------------------
igual(
  cotizar('2027-02-26', '2027-03-03', 'A', PERIODOS, 50),
  null,
  'si una noche no tiene período, la estadía entera no se cotiza'
);
igual(
  primeraNocheSinPrecio('2027-02-26', '2027-03-03', 'A', PERIODOS),
  '2027-03-01',
  'y se puede decir qué noche falta, para avisarle al dueño'
);

// El caso que importa: salteando las noches sin precio, estas cinco noches
// darían el total de tres. Tiene que dar null, no un número más chico.
igual(
  cotizar('2027-02-26', '2027-03-03', 'A', PERIODOS, 50) === null,
  true,
  'no cotiza de menos salteando las noches que faltan'
);

// ---------------------------------------------------------------------------
// Una unidad sin precio en un período que sí existe
// ---------------------------------------------------------------------------
// Pasa cuando el dueño agrega una cabaña y se olvida de ponerle precio en los
// períodos ya cargados. No puede heredar el de otro período.
const CON_HUECO: PeriodoPrecio[] = [
  { desde: '2027-01-01', hasta: '2027-01-31', precios: { A: 150000 } },
];
igual(precioDeLaNoche('2027-01-10', 'C', CON_HUECO), null, 'una unidad sin precio en el período no tiene precio');
igual(cotizar('2027-01-10', '2027-01-15', 'C', CON_HUECO, 50), null, 'y su estadía no se cotiza');

// ---------------------------------------------------------------------------
// La seña sale del porcentaje del complejo, no de una constante
// ---------------------------------------------------------------------------
igual(cotizar('2027-01-05', '2027-01-07', 'B', PERIODOS, 50)?.sena, 110000, 'seña del 50%');
igual(cotizar('2027-01-05', '2027-01-07', 'B', PERIODOS, 30)?.sena, 66000, 'seña del 30%');

// Redondeo: 3 noches a 110000 son 330000, el 35% es 115500 justo; con un total
// impar tiene que redondear y no arrastrar centavos.
igual(cotizar('2027-01-05', '2027-01-08', 'B', PERIODOS, 33)?.sena, 108900, 'la seña se redondea a peso entero');

// ---------------------------------------------------------------------------
// Fechas que no son estadía
// ---------------------------------------------------------------------------
igual(cotizar('2027-01-10', '2027-01-10', 'A', PERIODOS, 50), null, 'cero noches no se cotiza');
igual(cotizar('2027-01-15', '2027-01-10', 'A', PERIODOS, 50), null, 'ni una salida antes de la entrada');

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
