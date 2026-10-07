/**
 * Las reglas del calendario.
 *
 *   npx tsx src/lib/__tests__/calendario.manual.mts
 *
 * El caso que más importa es el de la temporada alta de Las Cañas, que allá
 * estaba escrita en el código: 20/12 al 1/3, siete noches, entrando sábado o
 * domingo. Acá se carga como un tramo y tiene que dar lo mismo.
 */

import { validar, minimoPara, type Reglas } from '../calendario.js';

let fallas = 0;
const igual = (real: unknown, esperado: unknown, nombre: string) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(
    `${ok ? 'OK    ' : 'FALLA '} ${nombre}` +
      (ok ? '' : `  [esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}]`)
  );
};
const motivo = (v: ReturnType<typeof validar>) => (v.ok ? 'ok' : v.motivo);

// La configuración de Las Cañas, tal como quedaría cargada en AlojaOS.
const REGLAS: Reglas = {
  hoy: '2026-10-07',
  config: { primera_fecha: '2026-12-01', ultima_fecha: '2027-03-31', minimo_noches: 2 },
  bloques: [
    // Un finde largo que se alquila completo.
    { check_in: '2026-11-21', check_out: '2026-11-24', etiqueta: 'finde largo de noviembre' },
  ],
  minimos: [
    // La ex-constante TEMPORADA_ALTA, ahora como dato.
    { desde: '2026-12-20', hasta: '2027-03-01', noches: 7, etiqueta: 'temporada alta', dias_checkin: [6, 0] },
  ],
};

// ---------------------------------------------------------------------------
// La ventana de reservas
// ---------------------------------------------------------------------------
igual(motivo(validar(REGLAS, '2026-11-15', '2026-11-18')), 'antes_de_la_ventana', 'antes del 1/12 no se reserva');
igual(motivo(validar(REGLAS, '2026-12-05', '2026-12-08')), 'ok', 'el 5/12 sí');

// `ultima_fecha` es la última NOCHE: quien entra el 31/3 y sale el 1/4 está
// usando la última noche, y eso vale. Si se comparara el check-out contra el
// 31 se le robaría esa noche.
igual(motivo(validar(REGLAS, '2027-03-29', '2027-04-01')), 'ok', 'la última noche reservable se puede usar');
igual(motivo(validar(REGLAS, '2027-03-30', '2027-04-02')), 'despues_de_la_ventana', 'pero una noche más, no');

// ---------------------------------------------------------------------------
// El mínimo general
// ---------------------------------------------------------------------------
igual(motivo(validar(REGLAS, '2026-12-05', '2026-12-06')), 'pocas_noches', 'una noche no llega al mínimo de 2');
igual(motivo(validar(REGLAS, '2026-12-05', '2026-12-07')), 'ok', 'dos noches sí');

// ---------------------------------------------------------------------------
// Temporada alta: siete noches, entrando sábado o domingo
// ---------------------------------------------------------------------------
// El 2/1/2027 es sábado.
igual(motivo(validar(REGLAS, '2027-01-02', '2027-01-09')), 'ok', 'sábado, 7 noches: entra');
// El 3/1/2027 es domingo.
igual(motivo(validar(REGLAS, '2027-01-03', '2027-01-10')), 'ok', 'domingo, 7 noches: entra');
// El 4/1/2027 es lunes.
igual(motivo(validar(REGLAS, '2027-01-04', '2027-01-11')), 'dia_de_entrada', 'lunes no, aunque sean 7 noches');
igual(motivo(validar(REGLAS, '2027-01-02', '2027-01-07')), 'pocas_noches', 'sábado pero 5 noches: no llega');

// El mínimo del tramo pisa al general: cinco noches alcanzan en diciembre
// temprano y no alcanzan en enero.
igual(minimoPara(REGLAS, '2026-12-05', '2026-12-10').noches, 2, 'en diciembre temprano el mínimo es 2');
igual(minimoPara(REGLAS, '2027-01-02', '2027-01-07').noches, 7, 'en temporada alta es 7');

// Alcanza con TOCAR el tramo: quien entra el 18/12 y se queda hasta el 26 pasa
// por la temporada alta, así que se lleva su mínimo. Es la regla del original:
// "quien entra el último día de un fin de semana largo se lleva el mismo
// mínimo que quien entra el primero".
igual(minimoPara(REGLAS, '2026-12-18', '2026-12-26').noches, 7, 'tocar el tramo alcanza para llevarse su mínimo');

// El último día del tramo (1/3) todavía cuenta, porque `hasta` es inclusivo.
igual(minimoPara(REGLAS, '2027-03-01', '2027-03-03').noches, 7, 'el 1 de marzo todavía es temporada alta');
igual(minimoPara(REGLAS, '2027-03-02', '2027-03-04').noches, 2, 'el 2 de marzo ya no');

// ---------------------------------------------------------------------------
// Bloques que van enteros
// ---------------------------------------------------------------------------
// El bloque de noviembre cae antes de `primera_fecha`, así que para probarlo
// hace falta una configuración con la ventana abierta más temprano.
const CON_BLOQUE: Reglas = {
  ...REGLAS,
  config: { ...REGLAS.config, primera_fecha: '2026-11-01' },
};

igual(motivo(validar(CON_BLOQUE, '2026-11-21', '2026-11-24')), 'ok', 'el bloque tomado entero entra');
igual(motivo(validar(CON_BLOQUE, '2026-11-21', '2026-11-23')), 'bloque_fijo', 'tomar parte del bloque, no');
igual(motivo(validar(CON_BLOQUE, '2026-11-22', '2026-11-24')), 'bloque_fijo', 'ni entrando un día después');
igual(motivo(validar(CON_BLOQUE, '2026-11-20', '2026-11-25')), 'bloque_fijo', 'ni pidiendo más de lo que es');
igual(motivo(validar(CON_BLOQUE, '2026-11-18', '2026-11-21')), 'ok', 'lo que termina donde arranca el bloque sí');
igual(motivo(validar(CON_BLOQUE, '2026-11-24', '2026-11-27')), 'ok', 'y lo que arranca donde termina, también');

// Un bloque de 3 noches vale aunque el mínimo general sea 2 — y valdría igual
// si fuera menor que el mínimo, porque el dueño lo cargó así a propósito.
const BLOQUE_CORTO: Reglas = {
  hoy: '2026-10-07',
  config: { primera_fecha: null, ultima_fecha: '2027-03-31', minimo_noches: 5 },
  bloques: [{ check_in: '2026-11-21', check_out: '2026-11-23', etiqueta: 'finde' }],
  minimos: [],
};
igual(
  motivo(validar(BLOQUE_CORTO, '2026-11-21', '2026-11-23')),
  'ok',
  'un bloque más corto que el mínimo general vale igual'
);

// ---------------------------------------------------------------------------
// Sin primera_fecha, la ventana arranca hoy
// ---------------------------------------------------------------------------
const SIN_PRIMERA: Reglas = {
  hoy: '2026-10-07',
  config: { primera_fecha: null, ultima_fecha: '2027-03-31', minimo_noches: 1 },
  bloques: [],
  minimos: [],
};
igual(motivo(validar(SIN_PRIMERA, '2026-10-06', '2026-10-08')), 'antes_de_la_ventana', 'ayer no se reserva');
igual(motivo(validar(SIN_PRIMERA, '2026-10-07', '2026-10-09')), 'ok', 'hoy sí');

// Y una primera_fecha ya pasada no adelanta nada: sigue siendo hoy.
const PRIMERA_VIEJA: Reglas = {
  ...SIN_PRIMERA,
  config: { ...SIN_PRIMERA.config, primera_fecha: '2026-01-01' },
};
igual(motivo(validar(PRIMERA_VIEJA, '2026-10-06', '2026-10-08')), 'antes_de_la_ventana', 'una fecha de apertura vieja no deja reservar en el pasado');

// ---------------------------------------------------------------------------
// Fechas imposibles
// ---------------------------------------------------------------------------
igual(motivo(validar(REGLAS, '2027-01-10', '2027-01-10')), 'fechas_invalidas', 'entrar y salir el mismo día');
igual(motivo(validar(REGLAS, '2027-01-15', '2027-01-10')), 'fechas_invalidas', 'salir antes de entrar');

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
