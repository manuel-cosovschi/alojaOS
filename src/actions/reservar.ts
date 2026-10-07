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

import { clienteServidor } from '@/lib/supabase/servidor';

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
  | { ok: true; id: string; noches: number; total: number; sena: number; venceEl: string }
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

  const { data, error } = await clienteServidor().rpc('crear_reserva', {
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
    return {
      ok: true,
      id: String(r.id),
      noches: Number(r.noches),
      total: Number(r.total),
      sena: Number(r.sena),
      venceEl: String(r.vence_el),
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

/** En qué quedó una reserva. Sólo estado y vencimiento: nada del huésped. */
export async function estadoDeReserva(
  id: string
): Promise<{ estado: string | null; venceEl: string | null }> {
  const { data, error } = await clienteServidor().rpc('estado_reserva', { p_reserva: id });

  if (error) {
    console.error('[estadoDeReserva] la base devolvió un error:', error.message);
    return { estado: null, venceEl: null };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  return {
    estado: typeof r.estado === 'string' ? r.estado : null,
    venceEl: typeof r.vence_el === 'string' ? r.vence_el : null,
  };
}
