/**
 * En qué quedó una reserva.
 *
 *   GET /api/estado-reserva?id=<uuid>
 *
 * Para que el huésped pueda volver más tarde y ver si el dueño le confirmó,
 * sin crearse una cuenta. El id de la reserva es lo único que lo identifica.
 *
 * Devuelve lo mismo que `estado_reserva()` y nada más: el estado, el
 * vencimiento y si el comprobante está registrado. **No** el nombre, ni el
 * teléfono, ni el importe, ni la ruta del archivo. El id es un UUID aleatorio,
 * pero igual se contesta lo mínimo: un id adivinado no tiene que servir para
 * sacarle datos a nadie, y un id que no existe contesta lo mismo que uno ajeno.
 */

import { estadoDeLaSena } from '@/actions/comprobante';

export const dynamic = 'force-dynamic';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(pedido: Request) {
  const id = new URL(pedido.url).searchParams.get('id') ?? '';

  // Se valida la forma antes de preguntar: así un parámetro cualquiera no llega
  // a la base para que ella decida que no es un UUID.
  if (!ES_UUID.test(id)) {
    return Response.json({ estado: null, vence_el: null, comprobante: false }, { status: 400 });
  }

  const estado = await estadoDeLaSena(id);

  return Response.json(
    { estado: estado.estado, vence_el: estado.venceEl, comprobante: estado.comprobante },
    // Sin caché: es el estado de algo que cambia cuando el dueño aprueba, y
    // una respuesta vieja le diría al huésped que todavía no le confirmaron.
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
