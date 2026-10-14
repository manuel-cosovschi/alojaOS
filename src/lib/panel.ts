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

export interface AvisoQueNoSalio {
  reserva_id: string;
  tipo: string;
  estado: string;
  error: string | null;
  intentos: number;
  huesped_nombre: string | null;
  huesped_telefono: string | null;
  huesped_email: string | null;
  check_in: string;
  cuando: string;
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

/**
 * A qué huésped no le llegó su aviso.
 *
 * Esto es lo que convierte un mail perdido en algo que alguien puede arreglar.
 * Sin esta lista, un proveedor que empieza a rechazar todo se nota cuando un
 * huésped se queja —que puede ser nunca, porque el que no recibió el mail no
 * sabe que tenía que recibirlo—.
 *
 * Incluye las reservas que NO tienen ninguna fila de aviso, no sólo las que
 * fallaron: para el huésped «no se intentó» y «falló» son lo mismo. La función
 * de la base lo hace con un LEFT JOIN desde `reservas`.
 */
export async function avisosQueNoSalieron(complejoId: string): Promise<AvisoQueNoSalio[]> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('avisos_que_no_salieron', { p_complejo: complejoId });

  if (error) {
    console.error('[avisosQueNoSalieron] la base devolvió un error:', error.message);
    return [];
  }
  return (data ?? []) as AvisoQueNoSalio[];
}

export interface Bloqueo {
  id: string;
  unidad_id: string;
  unidad_codigo: string;
  unidad_nombre: string;
  check_in: string;
  check_out: string;
  noches: number;
  motivo: string | null;
  creado_el: string;
}

export interface UnidadDelPanel {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
}

/** Las unidades del complejo, para elegir cuál cerrar. */
export async function unidadesDe(complejoId: string): Promise<UnidadDelPanel[]> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase
    .from('unidades')
    .select('id, codigo, nombre, orden')
    .eq('complejo_id', complejoId)
    .order('orden');

  if (error) {
    console.error('[unidadesDe] la base devolvió un error:', error.message);
    return [];
  }
  return (data ?? []) as UnidadDelPanel[];
}

/**
 * Las fechas que el dueño tiene cerradas, de hoy en adelante.
 *
 * Lista aparte de las reservas a propósito: en la cabeza del dueño son dos
 * cosas distintas, y mezclarlas lo haría buscar entre reservas de gente para
 * encontrar la semana que cerró él.
 */
export async function bloqueosDe(complejoId: string): Promise<Bloqueo[]> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('bloqueos_del_complejo', { p_complejo: complejoId });

  if (error) {
    console.error('[bloqueosDe] la base devolvió un error:', error.message);
    return [];
  }
  return (data ?? []) as Bloqueo[];
}

/** El precio de una unidad en un período. `precio` null = no tiene. */
export interface PrecioDeUnidad {
  unidad_id: string;
  codigo: string;
  nombre: string;
  precio: string | null;
}

export interface PeriodoDePrecio {
  id: string;
  desde: string;
  hasta: string;
  noches: number;
  etiqueta: string | null;
  precios: PrecioDeUnidad[];
}

export interface UnidadSinPrecio {
  unidad_id: string;
  codigo: string;
  nombre: string;
  noches: number;
  desde: string;
  periodos: number;
}

/**
 * Qué no se puede cotizar.
 *
 * `sin_config: true` deja el resto de los campos sin definir, porque sin
 * `ultima_fecha` no hay ventana sobre la que contar nada.
 */
export type SaludDeLosPrecios =
  | {
      esta_bien: false;
      sin_config: true;
      unidades: number;
      mensaje: string;
    }
  | {
      esta_bien: boolean;
      sin_config: false;
      unidades: number;
      ventana_desde: string;
      ventana_hasta: string;
      ventana_vencida: boolean;
      dias_hasta_el_cierre: number;
      noches_sin_periodo: number;
      primera_noche_sin_periodo: string | null;
      unidades_sin_precio: UnidadSinPrecio[];
    };

/**
 * Los períodos de precio del complejo, con una entrada por unidad.
 *
 * Las unidades sin precio vienen con `precio: null` y no omitidas: un hueco que
 * no está en los datos es un hueco que la pantalla no puede mostrar, y
 * mostrarlo es la mitad del punto.
 */
export async function periodosDe(complejoId: string): Promise<PeriodoDePrecio[]> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('periodos_del_complejo', { p_complejo: complejoId });

  if (error) {
    console.error('[periodosDe] la base devolvió un error:', error.message);
    return [];
  }
  return (data ?? []) as PeriodoDePrecio[];
}

/**
 * Qué del catálogo de precios no se puede vender.
 *
 * Esto no es un informe de cortesía: una unidad sin precio en un período queda
 * invendible toda la temporada y en la pantalla no se ve nada raro —el
 * calendario la muestra libre y recién al pedir el precio aparece que no hay—.
 * Y `ultima_fecha` es una fecha que se pasa sola: el día que pasa, el
 * calendario deja de ofrecer absolutamente todo.
 *
 * Devuelve null sólo si la consulta falló. Eso también se muestra, porque «no
 * pude comprobarlo» no es «está bien».
 */
export async function saludDeLosPrecios(complejoId: string): Promise<SaludDeLosPrecios | null> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('salud_de_los_precios', { p_complejo: complejoId });

  if (error) {
    console.error('[saludDeLosPrecios] la base devolvió un error:', error.message);
    return null;
  }
  return data as SaludDeLosPrecios;
}
