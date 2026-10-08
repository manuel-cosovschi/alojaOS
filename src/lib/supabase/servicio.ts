/**
 * El cliente con la clave de servicio.
 *
 * Esta clave saltea RLS: con ella se lee y se escribe cualquier fila de
 * cualquier complejo. Dos reglas, y las dos son absolutas:
 *
 *   1. **Nunca en una variable `NEXT_PUBLIC_`.** Todo lo que empiece con eso
 *      viaja al navegador. La clave pública es pública a propósito; esta no.
 *   2. **Sólo donde no alcanza la clave pública.** Hoy eso es un solo lugar: el
 *      comprobante de la seña. El huésped no tiene cuenta, así que no puede
 *      escribir el bucket él mismo, y dejarlo escribir significaría que
 *      cualquiera pueda subir cualquier cosa a la carpeta de cualquiera. Lo
 *      sube el servidor, después de comprobar que la reserva existe, está
 *      esperando la seña y no venció.
 *
 * La página pública usa `clienteServidor()`, que va con la clave pública y
 * queda sujeto a las policies. Si algún día este módulo aparece importado desde
 * una pantalla, es un error: no hay nada que mostrar que necesite saltear RLS.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function clienteServicio(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !clave) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY. La necesita sólo la subida del ' +
        'comprobante, del lado del servidor. No la pongas en una variable NEXT_PUBLIC_.'
    );
  }

  return createClient(url, clave, { auth: { persistSession: false } });
}

/** El bucket privado donde viven los comprobantes. */
export const BUCKET_COMPROBANTES = 'comprobantes';
