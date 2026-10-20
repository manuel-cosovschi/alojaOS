import { headers } from 'next/headers';

/**
 * La IP de quien está pidiendo: una reserva, o una demo.
 *
 * Sale de las cabeceras que pone la red, no de nada que mande el navegador: el
 * que reserva no puede elegir la suya. `x-forwarded-for` puede traer varias
 * —la del visitante y las de los intermediarios—; la primera es la del
 * visitante.
 *
 * Si no viene ninguna, devuelve `null` y la base no aplica el freno por IP. Es
 * a propósito: inventar una IP sería peor que no tenerla, porque todas las
 * reservas sin IP compartirían el mismo cupo y se frenarían entre ellas.
 */
export async function ipDeQuienPide(): Promise<string | null> {
  const h = await headers();
  const reenviada = h.get('x-forwarded-for');
  if (reenviada) return reenviada.split(',')[0]?.trim() || null;
  return h.get('x-real-ip')?.trim() || null;
}
