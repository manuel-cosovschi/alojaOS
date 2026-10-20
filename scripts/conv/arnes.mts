/**
 * El arnés de las baterías: numera, corre y cuenta.
 *
 * Cada prueba lleva un número, y el número es lo que se cita cuando algo
 * falla («falló la 14»). Por eso el arnés se revisa a sí mismo antes de correr
 * nada: si dos pruebas tienen el mismo número, corta. Pasó en AlojaOS que dos
 * filas compartían número y un informe decía «pasó la 12» refiriéndose a otra
 * cosa que la que alguien estaba mirando: un informe que contesta que está bien
 * sin estar hablando de lo mismo.
 */

type Prueba = { numero: number; nombre: string; correr: () => Promise<void> };

const pruebas: Prueba[] = [];

export function prueba(numero: number, nombre: string, correr: () => Promise<void>) {
  pruebas.push({ numero, nombre, correr });
}

/** Una afirmación que, si no se cumple, dice qué se esperaba y qué hubo. */
export function afirmar(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new Error(mensaje);
}

export async function correrTodas(titulo: string): Promise<number> {
  const vistos = new Map<number, string>();
  for (const p of pruebas) {
    const otra = vistos.get(p.numero);
    if (otra) {
      console.error(`\n✗ El arnés tiene dos pruebas con el número ${p.numero}: «${otra}» y «${p.nombre}». No corro nada.\n`);
      return 2;
    }
    vistos.set(p.numero, p.nombre);
  }

  console.log(`\n${titulo}\n`);
  let fallas = 0;
  for (const p of [...pruebas].sort((a, b) => a.numero - b.numero)) {
    try {
      await p.correr();
      console.log(`  ✓ ${String(p.numero).padStart(2)}  ${p.nombre}`);
    } catch (e) {
      fallas += 1;
      console.log(`  ✗ ${String(p.numero).padStart(2)}  ${p.nombre}\n        ${(e instanceof Error ? e.message : String(e)).split('\n').join('\n        ')}`);
    }
  }
  console.log(`\n${pruebas.length - fallas} de ${pruebas.length} pasan${fallas ? ` — ${fallas} FALLAN` : ''}\n`);
  return fallas === 0 ? 0 : 1;
}

/**
 * Los `.ts` del proyecto llegan acá como CommonJS (el paquete no es `type:
 * module`) y la interoperación los envuelve en `default`. Esto devuelve el
 * módulo de verdad, venga como venga, con sus tipos.
 */
export function desenvolver<T extends object>(modulo: T): T {
  return ((modulo as { default?: T }).default ?? modulo) as T;
}
