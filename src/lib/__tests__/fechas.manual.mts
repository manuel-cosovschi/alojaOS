/**
 * El día de Argentina, visto desde un servidor en UTC.
 *
 *   npx tsx src/lib/__tests__/fechas.manual.mts
 *
 * No hay corredor de tests en el proyecto todavía, así que se corre a mano o
 * con `npm test`. La idea está copiada del test equivalente de GastroOS, que
 * nació después de que este mismo bug llegara a producción allá.
 *
 * El reloj se congela cambiando `Date` por una clase que devuelve un instante
 * fijo cuando se la llama sin argumentos. Con argumentos sigue siendo la de
 * siempre, que es como la usan los helpers para armar una fecha.
 *
 * Las horas que se prueban son las que rompían: entre las 21 y las 24 de
 * Argentina un servidor en UTC ya está en el día siguiente.
 */

import { hoyISO, noches, nochesDe, sumarDias, seSuperponen, tramoToca, diaDeSemana } from '../fechas.js';

const RealDate = Date;

function congelar(iso: string) {
  const fijo = new RealDate(iso).getTime();
  class Congelada extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      // @ts-expect-error — el spread sobre el constructor de Date no se tipa.
      if (args.length === 0) super(fijo); else super(...args);
    }
    static now() {
      return fijo;
    }
  }
  globalThis.Date = Congelada as DateConstructor;
}

function descongelar() {
  globalThis.Date = RealDate;
}

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
// Hoy, a la hora en que esto se rompía
// ---------------------------------------------------------------------------

// Las 22:30 de un 30 de septiembre en Argentina. En UTC ya es el 1 de octubre.
congelar('2026-10-01T01:30:00Z');
igual(hoyISO(), '2026-09-30', 'a las 22:30 de Argentina, hoy sigue siendo el 30');
descongelar();

// Las 21:30 de un 30 de noviembre: la noche en que el panel de Las Cañas abre
// en la temporada equivocada, porque en UTC ya es diciembre.
congelar('2026-12-01T00:30:00Z');
igual(hoyISO(), '2026-11-30', 'el 30 de noviembre a las 21:30 todavía es noviembre');
descongelar();

// Las 21:00 del 31 de diciembre: el año tampoco se adelanta.
congelar('2027-01-01T00:00:00Z');
igual(hoyISO(), '2026-12-31', 'el 31 de diciembre a las 21 todavía es 2026');
descongelar();

// Media mañana: sin diferencia entre UTC y Argentina.
congelar('2026-10-06T14:00:00Z');
igual(hoyISO(), '2026-10-06', 'a las 11 de la mañana los dos coinciden');
descongelar();

// Un 29 de febrero, por las dudas.
congelar('2028-02-29T15:00:00Z');
igual(hoyISO(), '2028-02-29', 'el 29 de febrero existe');
descongelar();

// ---------------------------------------------------------------------------
// Contar noches
// ---------------------------------------------------------------------------
igual(noches('2027-01-10', '2027-01-17'), 7, 'del 10 al 17 son 7 noches');
igual(noches('2027-01-10', '2027-01-11'), 1, 'una noche es una noche');
igual(noches('2027-01-10', '2027-01-10'), 0, 'entrar y salir el mismo día no es ninguna');

// El cambio de hora: entre el sábado y el domingo hay 23 horas, y sigue siendo
// una noche. Contar con milisegundos acá da 0 por redondeo.
igual(noches('2026-10-17', '2026-10-18'), 1, 'la noche del cambio de hora sigue siendo una');

// Febrero de un año bisiesto.
igual(noches('2028-02-27', '2028-03-01'), 3, 'del 27/2 al 1/3 de 2028 son 3 noches');

igual(
  nochesDe('2027-01-10', '2027-01-13'),
  ['2027-01-10', '2027-01-11', '2027-01-12'],
  'las noches son los días sin el de salida'
);

igual(sumarDias('2026-12-31', 1), '2027-01-01', 'sumar un día cruza de año');
igual(sumarDias('2028-02-28', 1), '2028-02-29', 'y cae en el 29 cuando el año es bisiesto');

// ---------------------------------------------------------------------------
// Superposición: la regla que decide si dos reservas chocan
// ---------------------------------------------------------------------------

// La de siempre: el día de salida de una es el de entrada de la otra.
igual(
  seSuperponen('2027-01-10', '2027-01-17', '2027-01-17', '2027-01-20'),
  false,
  'el día de salida de una puede ser el de entrada de la otra'
);
igual(
  seSuperponen('2027-01-10', '2027-01-17', '2027-01-16', '2027-01-20'),
  true,
  'una noche compartida ya es conflicto'
);
igual(
  seSuperponen('2027-01-10', '2027-01-17', '2027-01-12', '2027-01-14'),
  true,
  'una estadía entera adentro de otra choca'
);
igual(
  seSuperponen('2027-01-12', '2027-01-14', '2027-01-10', '2027-01-17'),
  true,
  'y al revés también'
);
igual(
  seSuperponen('2027-01-10', '2027-01-17', '2027-01-20', '2027-01-25'),
  false,
  'dos estadías separadas no chocan'
);
igual(
  seSuperponen('2027-01-10', '2027-01-17', '2027-01-05', '2027-01-10'),
  false,
  'la que termina justo donde arranca la otra tampoco'
);

// ---------------------------------------------------------------------------
// Tramos con `hasta` inclusivo
// ---------------------------------------------------------------------------
// Un tramo que termina el 31 toca a quien entra el 31, porque el 31 es una
// noche del tramo.
igual(
  tramoToca('2027-01-01', '2027-01-31', '2027-01-31', '2027-02-05'),
  true,
  'un tramo que termina el 31 toca a quien entra el 31'
);
igual(
  tramoToca('2027-01-01', '2027-01-31', '2027-02-01', '2027-02-05'),
  false,
  'pero no a quien entra el 1 de febrero'
);
igual(
  tramoToca('2027-01-01', '2027-01-31', '2026-12-28', '2027-01-02'),
  true,
  'y toca a quien entra antes y se queda hasta adentro del tramo'
);

// ---------------------------------------------------------------------------
// Día de la semana: tiene que coincidir con `extract(dow)` de Postgres
// ---------------------------------------------------------------------------
igual(diaDeSemana('2027-01-10'), 0, 'el 10/1/2027 es domingo (0)');
igual(diaDeSemana('2027-01-09'), 6, 'el 9/1/2027 es sábado (6)');
igual(diaDeSemana('2027-01-11'), 1, 'el 11/1/2027 es lunes (1)');

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
