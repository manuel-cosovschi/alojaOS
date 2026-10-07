/**
 * A qué temporada pertenece una fecha.
 *
 *   npx tsx src/lib/__tests__/temporada.manual.mts
 *
 * El caso que importa es el que hoy está mal en el panel de Las Cañas: la
 * temporada del 30 de noviembre a las 21:30. Allá `temporadaDe()` recibe
 * `new Date().toISOString().slice(0,10)`, que a esa hora ya dice diciembre, y
 * el panel abre en la temporada que todavía no empezó — justo lo que el
 * comentario de esa línea decía estar evitando.
 *
 * Acá la función no mira el reloj: recibe el día. Eso es lo que hace que el bug
 * sea imposible y no sólo improbable.
 */

import { temporadaDe, nombreTemporada, rangoTemporada } from '../temporada.js';
import { hoyISO } from '../fechas.js';

let fallas = 0;
const igual = (real: unknown, esperado: unknown, nombre: string) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(
    `${ok ? 'OK    ' : 'FALLA '} ${nombre}` +
      (ok ? '' : `  [esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}]`)
  );
};

const RealDate = Date;
function congelar(iso: string) {
  const fijo = new RealDate(iso).getTime();
  class Congelada extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      // @ts-expect-error — el spread sobre el constructor de Date no se tipa.
      if (args.length === 0) super(fijo); else super(...args);
    }
    static now() { return fijo; }
  }
  globalThis.Date = Congelada as DateConstructor;
}
function descongelar() { globalThis.Date = RealDate; }

// ---------------------------------------------------------------------------
// Temporada que arranca en diciembre (Las Cañas)
// ---------------------------------------------------------------------------
igual(temporadaDe('2026-12-01', 12), 2026, 'diciembre de 2026 es la temporada 2026');
igual(temporadaDe('2026-12-31', 12), 2026, 'y el 31 también');
igual(temporadaDe('2027-01-15', 12), 2026, 'enero de 2027 sigue siendo la 2026');
igual(temporadaDe('2027-03-31', 12), 2026, 'y marzo también');
igual(temporadaDe('2026-11-30', 12), 2025, 'noviembre de 2026 es todavía la 2025');

// El caso del bug: el 30 de noviembre a las 21:30 de Argentina.
congelar('2026-12-01T00:30:00Z');
igual(
  temporadaDe(hoyISO(), 12),
  2025,
  'el 30 de noviembre a las 21:30 la temporada en curso sigue siendo la 2025'
);
// Y para que quede claro de qué se trata: esto es lo que da el código viejo.
igual(
  temporadaDe(new Date().toISOString().slice(0, 10), 12),
  2026,
  '(y así es como el panel viejo abre en la temporada equivocada)'
);
descongelar();

// ---------------------------------------------------------------------------
// Temporada que arranca en junio (un complejo de montaña)
// ---------------------------------------------------------------------------
igual(temporadaDe('2026-06-01', 6), 2026, 'junio de 2026 es la temporada 2026');
igual(temporadaDe('2026-05-31', 6), 2025, 'mayo de 2026 es la 2025');
igual(temporadaDe('2027-01-15', 6), 2026, 'enero de 2027 sigue siendo la 2026');

// ---------------------------------------------------------------------------
// Temporada que arranca en enero: año calendario, sin cruce
// ---------------------------------------------------------------------------
igual(temporadaDe('2026-01-01', 1), 2026, 'con arranque en enero la temporada es el año');
igual(temporadaDe('2026-12-31', 1), 2026, 'todo el año es la misma');

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------
igual(nombreTemporada(2026, 12), 'Temporada 26-27', 'la que cruza el año se nombra con los dos');
igual(nombreTemporada(2026, 1), 'Temporada 2026', 'la que no cruza, con uno solo');

// ---------------------------------------------------------------------------
// Rangos
// ---------------------------------------------------------------------------
igual(rangoTemporada(2026, 12), { desde: '2026-12-01', hasta: '2027-11-30' }, 'diciembre a noviembre');
igual(rangoTemporada(2026, 6), { desde: '2026-06-01', hasta: '2027-05-31' }, 'junio a mayo');
igual(rangoTemporada(2026, 1), { desde: '2026-01-01', hasta: '2026-12-31' }, 'enero a diciembre');
// Un año bisiesto en el medio, para que el último día no se calcule con una
// tabla de días por mes.
igual(rangoTemporada(2027, 3), { desde: '2027-03-01', hasta: '2028-02-29' }, 'marzo a febrero de un año bisiesto');

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
