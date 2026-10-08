/**
 * Lo que el panel lee.
 *
 * Todo pasa por el cliente con sesión, así que lo que vuelve lo decide RLS con
 * `auth.uid()` puesto. Ninguna de estas funciones filtra por complejo en el
 * `SELECT`: filtran porque la policy no deja ver otro. Es la diferencia entre
 * un filtro que alguien se puede olvidar y uno que no se puede saltear.
 */

import { clienteConSesion } from '@/lib/supabase/sesion';

export interface ComplejoDelDuenio {
  id: string;
  slug: string;
  nombre: string;
  moneda: string;
  zona_horaria: string;
  whatsapp: string | null;
  datos_transferencia: string | null;
  reservas_habilitadas: boolean;
}

export interface SenaPendiente {
  id: string;
  unidad_codigo: string;
  check_in: string;
  check_out: string;
  huesped_nombre: string | null;
  huesped_telefono: string | null;
  huesped_email: string | null;
  personas: number | null;
  importe: string | null;
  vence_el: string | null;
  created_at: string;
  comprobante_path: string | null;
  comprobante_subido_el: string | null;
}

export interface SaludDelVencimiento {
  atrasadas: number;
  esperando: number;
  mecanismo: 'cron' | 'cron_apagado' | 'al_leer';
  ultima_corrida: string | null;
  fallas_ultimo_dia: number;
  nunca_corrio: boolean;
  esta_bien: boolean;
}

/** Los complejos de los que este usuario es miembro. */
export async function misComplejos(): Promise<ComplejoDelDuenio[]> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase
    .from('complejos')
    .select('id, slug, nombre, moneda, zona_horaria, whatsapp, datos_transferencia, reservas_habilitadas')
    .order('nombre');

  if (error) {
    console.error('[misComplejos] la base devolvió un error:', error.message);
    return [];
  }
  return (data ?? []) as ComplejoDelDuenio[];
}

/**
 * Las señas que esperan revisión.
 *
 * Va por `reservas_pendientes()` y no por un `select` a mano porque esa función
 * **vence lo vencido antes de leer**. Un `select ... where estado =
 * 'HOLD_TRANSFER'` devolvería holds que ya murieron y el dueño los vería como
 * si todavía valieran. Y no filtra las atrasadas de la lectura: si el
 * vencimiento estuviera roto, la lista se vería igual de bien, y es justo lo que
 * no se quiere.
 */
export async function senasPendientes(complejoId: string): Promise<SenaPendiente[]> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('reservas_pendientes', { p_complejo: complejoId });

  if (error) {
    console.error('[senasPendientes] la base devolvió un error:', error.message);
    return [];
  }
  return (data ?? []) as SenaPendiente[];
}

/** Cómo viene la temporada: lo que ya entró y lo que falta. */
export async function saludDelVencimiento(): Promise<SaludDelVencimiento | null> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('salud_del_vencimiento');

  if (error) {
    console.error('[saludDelVencimiento] la base devolvió un error:', error.message);
    return null;
  }
  return data as SaludDelVencimiento;
}
