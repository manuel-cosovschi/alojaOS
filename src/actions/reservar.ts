'use server';

/**
 * Pedir una reserva.
 *
 * Esto es una cáscara fina sobre `crear_reserva()`, y tiene que seguir siéndolo.
 * Toda la decisión —las reglas del calendario, el mínimo de noches, el día de
 * entrada, la capacidad, el precio y la superposición— está en la base, en una
 * sola transacción. Si parte de eso se mudara acá, habría dos lugares que
 * pueden estar en desacuerdo, y el que tiene razón sería el que no se ve.
 *
 * Lo que NO se manda: ni el estado, ni el importe, ni el vencimiento. Los
 * decide la base. En el sistema anterior el alta guardaba el `importe` que
 * calculaba la página, y un importe que llega del navegador es un dato del
 * cliente.
 */

import { ipDeQuienPide } from '@/lib/ip';
import { clienteServicio } from '@/lib/supabase/servicio';
import { programarAviso } from '@/actions/avisar';

export interface Pedido {
  slug: string;
  unidadId: string;
  checkIn: string;
  checkOut: string;
  personas: number;
  nombre: string;
  dni: string;
  email: string;
  telefono: string;
  notas?: string;
}

export type Resultado =
  | {
      ok: true;
      id: string;
      noches: number;
      total: number;
      sena: number;
      venceEl: string;
      /** Dónde transferir. Viaja con la reserva y no se puede pedir con el slug. */
      datosTransferencia: string | null;
      whatsapp: string | null;
    }
  | { ok: false; mensaje: string; motivo?: string };

/** Mensajes para cuando la base devuelve un motivo sin texto propio. */
const MENSAJE: Record<string, string> = {
  complejo_inexistente: 'No encontramos este complejo.',
  unidad_inexistente: 'Esa unidad no está disponible.',
  calendario_sin_configurar: 'Todavía no están cargadas las fechas. Escribinos y lo vemos.',
  fechas_invalidas: 'La fecha de salida tiene que ser posterior a la de entrada.',
};

export async function pedirReserva(pedido: Pedido): Promise<Resultado> {
  const faltan = (
    [
      ['nombre', pedido.nombre],
      ['dni', pedido.dni],
      ['email', pedido.email],
      ['telefono', pedido.telefono],
    ] as const
  ).filter(([, v]) => !String(v ?? '').trim());

  if (faltan.length) {
    return { ok: false, mensaje: 'Faltan datos para completar la reserva.', motivo: 'faltan_datos' };
  }

  // ------------------------------------------------------------------
  // Con la clave de SERVICIO, y no con la publicable
  // ------------------------------------------------------------------
  // Desde la migración 024 `crear_reserva` está revocada de `anon`: la única
  // forma de crear una reserva es por acá. Antes se podía llamar derecho por
  // `/rest/v1/rpc/crear_reserva` con la clave que viaja en el navegador, y la
  // auditoría del 15/10 lo usó para tomar catorce noches en un segundo.
  //
  // Y como ahora pasa por acá, podemos decirle a la base DE DÓNDE viene. Eso
  // es lo que la base no podía saber sola, y es lo que distingue un script de
  // un fin de semana largo.
  const ip = (await ipDeQuienPide()) ?? null;

  const { data, error } = await clienteServicio().rpc('crear_reserva', {
    p_ip: ip,
    p_slug: pedido.slug,
    p_unidad: pedido.unidadId,
    p_check_in: pedido.checkIn,
    p_check_out: pedido.checkOut,
    p_personas: pedido.personas,
    p_nombre: pedido.nombre.trim(),
    p_dni: pedido.dni.trim(),
    p_email: pedido.email.trim(),
    p_telefono: pedido.telefono.trim(),
    p_acompanantes: [],
    p_medio_pago: 'transferencia',
    p_notas: pedido.notas?.trim() || null,
  });

  if (error) {
    // Un error de la base no se le traduce al huésped como "no se pudo
    // reservar": eso lo haría parecer un problema de sus fechas. Queda en el
    // registro con el detalle y la pantalla pide reintentar.
    console.error('[pedirReserva] la base devolvió un error:', error.message);
    return {
      ok: false,
      mensaje: 'Tuvimos un problema al registrar la reserva. Probá de nuevo en un minuto.',
      motivo: 'error_base',
    };
  }

  const r = data as Record<string, unknown> | null;
  if (!r) {
    return { ok: false, mensaje: 'No recibimos respuesta al registrar la reserva.', motivo: 'sin_respuesta' };
  }

  if (r.ok === true) {
    // El mail sale después de contestarle al navegador: el huésped no tiene que
    // esperar a un proveedor para ver que su reserva quedó. Si no sale, la
    // reserva no se toca y el panel se lo dice al dueño.
    await programarAviso(String(r.id), 'sena_pendiente');

    return {
      ok: true,
      id: String(r.id),
      noches: Number(r.noches),
      total: Number(r.total),
      sena: Number(r.sena),
      venceEl: String(r.vence_el),
      // Vienen con la reserva, no de una función que cualquiera pueda llamar
      // con el slug: hasta la auditoría del 15/10, el alias y el CBU de cada
      // complejo se conseguían con una sola llamada sabiendo su dirección.
      datosTransferencia: typeof r.datos_transferencia === 'string' ? r.datos_transferencia : null,
      whatsapp: typeof r.whatsapp === 'string' ? r.whatsapp : null,
    };
  }

  const motivo = typeof r.motivo === 'string' ? r.motivo : undefined;
  return {
    ok: false,
    // La base manda el mensaje cuando lo que falló se le puede explicar a una
    // persona (pocas noches, día de entrada, ocupada). Si no, uno de acá.
    mensaje:
      (typeof r.mensaje === 'string' && r.mensaje) ||
      (motivo && MENSAJE[motivo]) ||
      'No pudimos registrar esa reserva.',
    motivo,
  };
}
