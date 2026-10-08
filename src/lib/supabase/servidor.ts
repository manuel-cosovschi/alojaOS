/**
 * El cliente de Supabase del lado del servidor.
 *
 * Usa la clave pública, la misma que viaja en el navegador: lo que este cliente
 * puede leer es lo que puede leer cualquiera, y eso está bien porque la página
 * pública sólo lee funciones públicas. `npm run aislamiento` comprueba que esa
 * frase siga siendo cierta.
 *
 * La clave de servicio NO se usa acá. La necesita sólo el alta de un complejo
 * nuevo, en su propio módulo, y cargarla donde no hace falta es la forma más
 * común de filtrarla.
 */

import { createClient } from '@supabase/supabase-js';

export function clienteServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !clave) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copiá .env.example a .env.local y completalas.'
    );
  }

  return createClient(url, clave, { auth: { persistSession: false } });
}
