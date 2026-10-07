/**
 * Leer el complejo de la petición.
 *
 * Una sola llamada a `complejo_publico()` trae todo lo que la página necesita:
 * la identidad, la marca, las unidades, las reglas del calendario y los
 * períodos de precio. Van juntos porque la página los pide juntos: sin precios
 * no puede cotizar, sin reglas no sabe qué fechas ofrecer.
 */

import { headers } from 'next/headers';
import { CABECERA_COMPLEJO } from './tenant';
import { clienteServidor } from './supabase/servidor';
import type { PeriodoPrecio } from './precios';
import type { BloqueFijo, ConfigCalendario, MinimoNoches } from './calendario';

export interface Unidad {
  id: string;
  codigo: string;
  nombre: string;
  capacidad_maxima: number;
  sugerencia_ocupacion: string | null;
}

export interface Marca {
  color_principal: string;
  color_fondo: string;
  color_texto: string;
  color_acento: string;
  tipografia_titulos: string | null;
  tipografia_cuerpo: string | null;
  logo_path: string | null;
}

export interface Complejo {
  id: string;
  slug: string;
  nombre: string;
  nombre_corto: string | null;
  descripcion: string | null;
  localidad: string | null;
  provincia: string | null;
  pais: string;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  marca: Marca;
  moneda: string;
  zona_horaria: string;
  porcentaje_sena: number;
  horas_vencimiento_sena: number;
  reservas_habilitadas: boolean;
  unidades: Unidad[];
  calendario: ConfigCalendario | null;
  bloques_fijos: BloqueFijo[];
  minimos_noches: MinimoNoches[];
  periodos_precio: PeriodoPrecio[];
}

/** El slug que el middleware dejó en la cabecera, o null en el dominio principal. */
export async function slugDeLaPeticion(): Promise<string | null> {
  const h = await headers();
  return h.get(CABECERA_COMPLEJO);
}

/** El complejo, o null si no existe. */
export async function leerComplejo(slug: string): Promise<Complejo | null> {
  const { data, error } = await clienteServidor().rpc('complejo_publico', { p_slug: slug });

  // Un error de la base no se devuelve como "no existe": son cosas distintas y
  // confundirlas haría que una caída se viera como un complejo inexistente.
  if (error) throw new Error(`No se pudo leer el complejo: ${error.message}`);

  return (data as Complejo | null) ?? null;
}

/** Las noches ocupadas de un complejo. Sin datos de quién las ocupa. */
export async function nochesOcupadas(
  complejoId: string,
  unidadId?: string
): Promise<Array<{ unidad_id: string; codigo: string; check_in: string; check_out: string }>> {
  const { data, error } = await clienteServidor().rpc('noches_ocupadas', {
    p_complejo: complejoId,
    p_unidad: unidadId ?? null,
  });

  if (error) throw new Error(`No se pudo leer la disponibilidad: ${error.message}`);
  return data ?? [];
}
