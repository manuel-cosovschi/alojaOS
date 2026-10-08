'use server';

/**
 * Lo que el dueño hace con una seña.
 *
 * ------------------------------------------------------------------
 * Quién decide que este dueño puede
 * ------------------------------------------------------------------
 * No este archivo. `aprobar_sena()` y `rechazar_sena()` son SECURITY DEFINER y
 * lo primero que hacen es `es_miembro(complejo_id)`; si no, levantan
 * `insufficient_privilege`. Así que el permiso se comprueba en la base, con la
 * sesión puesta, y no acá.
 *
 * Importa que sea así y no al revés: una pantalla que filtra bien y una base que
 * deja pasar todo es un bug a un `fetch` de distancia. La prueba de la base
 * tiene las dos aserciones —el vecino no puede aprobar ni rechazar una seña
 * ajena— y pasan porque la base lo impide, no porque la pantalla no lo ofrezca.
 *
 * ------------------------------------------------------------------
 * Ver el comprobante
 * ------------------------------------------------------------------
 * El bucket es privado y no tiene policies: nadie lo lee con su sesión, ni el
 * dueño. La URL firmada la arma el servidor con la clave de servicio, que
 * saltea RLS —y por lo tanto **acá sí hay que comprobar el permiso a mano**—.
 *
 * La comprobación es leer la reserva con el cliente CON SESIÓN primero. Si RLS
 * la devuelve, este usuario es miembro del complejo; si no, no. No se hace con
 * un `WHERE` escrito a mano: se delega en la misma policy que protege todo lo
 * demás, así no hay dos lugares que tengan que estar de acuerdo.
 */

import { clienteConSesion } from '@/lib/supabase/sesion';
import { BUCKET_COMPROBANTES, clienteServicio } from '@/lib/supabase/servicio';

export type Resultado = { ok: true; mensaje: string } | { ok: false; mensaje: string };

/** Cuántos segundos vive el enlace al comprobante. */
const VIDA_DEL_ENLACE = 120;

export async function aprobar(reservaId: string): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('aprobar_sena', { p_reserva: reservaId });

  if (error) {
    console.error('[aprobar] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return { ok: false, mensaje: motivoLegible(r) };
  }

  return {
    ok: true,
    mensaje: r.ya_estaba === true ? 'Ya estaba confirmada.' : 'Confirmada.',
  };
}

export async function rechazar(reservaId: string, motivo: string): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('rechazar_sena', {
    p_reserva: reservaId,
    p_motivo: motivo.trim() || null,
  });

  if (error) {
    console.error('[rechazar] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return { ok: false, mensaje: motivoLegible(r) };

  return { ok: true, mensaje: 'Rechazada. Las noches quedaron libres.' };
}

/**
 * Un enlace temporal al comprobante, o null.
 *
 * Devuelve null por las dos razones y no distingue: que la reserva no exista y
 * que sea de otro complejo contestan lo mismo. Si distinguiera, el id de una
 * reserva ajena serviría para saber que existe.
 */
export async function enlaceAlComprobante(reservaId: string): Promise<string | null> {
  const supabase = await clienteConSesion();

  // El permiso lo da RLS: si esta fila vuelve, el usuario es miembro.
  const { data: reserva, error } = await supabase
    .from('reservas')
    .select('comprobante_path')
    .eq('id', reservaId)
    .maybeSingle();

  if (error) {
    console.error('[enlaceAlComprobante] no pude leer la reserva:', error.message);
    return null;
  }
  if (!reserva?.comprobante_path) return null;

  let servicio: ReturnType<typeof clienteServicio>;
  try {
    servicio = clienteServicio();
  } catch (e) {
    console.error('[enlaceAlComprobante] no hay clave de servicio:', e);
    return null;
  }

  const { data, error: errorEnlace } = await servicio.storage
    .from(BUCKET_COMPROBANTES)
    .createSignedUrl(reserva.comprobante_path, VIDA_DEL_ENLACE);

  if (errorEnlace || !data?.signedUrl) {
    console.error('[enlaceAlComprobante] no pude firmar:', errorEnlace?.message);
    return null;
  }

  return data.signedUrl;
}

/** El texto de un error de la base, traducido a algo que se pueda leer. */
function mensajeDeError(mensaje: string): string {
  if (/insufficient_privilege|No tenés acceso/i.test(mensaje)) {
    return 'Esa reserva no es de tu complejo.';
  }
  return 'No pudimos hacerlo. Probá de nuevo en un minuto.';
}

/** El motivo que devolvió la función, con palabras. */
function motivoLegible(r: Record<string, unknown>): string {
  switch (r.motivo) {
    case 'no_existe':
      return 'No encontramos esa reserva.';
    case 'no_espera_sena':
      return `Esa reserva ya no está esperando la seña (está ${r.estado}).`;
    case 'no_se_puede_rechazar':
      return `Esa reserva no se puede rechazar (está ${r.estado}).`;
    default:
      return 'No pudimos hacerlo.';
  }
}
