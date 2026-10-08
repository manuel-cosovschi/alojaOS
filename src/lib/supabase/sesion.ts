/**
 * El cliente con la sesión del dueño.
 *
 * Es el tercero y el que faltaba. Los otros dos:
 *
 *   - `servidor.ts`: clave pública, sin sesión. Lo que lee es lo que puede leer
 *     cualquiera. Es el de la página de reservas.
 *   - `servicio.ts`: clave de servicio, saltea RLS. Un solo uso, el comprobante.
 *
 * Este va con la clave pública **más la sesión**, así que lo que lee lo decide
 * RLS con `auth.uid()` puesto. Es la diferencia que importa: el panel no filtra
 * por complejo en el `SELECT`, filtra porque la policy no le deja ver otro. Un
 * `WHERE complejo_id = …` que alguien se olvide de poner no abre nada.
 *
 * Las cookies las maneja `@supabase/ssr`. El `try/catch` del `set` no es
 * decoración: en un Server Component no se pueden escribir cookies, y ahí la
 * renovación del token la hace el middleware. Sin el catch, cada lectura del
 * panel tiraría.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function clienteConSesion() {
  const tarro = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !clave) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copiá .env.example a .env.local y completalas.'
    );
  }

  return createServerClient(url, clave, {
    cookies: {
      getAll: () => tarro.getAll(),
      setAll: (cookiesNuevas: Array<{ name: string; value: string; options: CookieOptions }>) => {
        try {
          for (const { name, value, options } of cookiesNuevas) {
            tarro.set(name, value, options);
          }
        } catch {
          // Server Component: no se puede escribir. El middleware ya renovó.
        }
      },
    },
  });
}

/**
 * Quién está logueado, o null.
 *
 * Va con `getUser()` y no con `getSession()` a propósito: `getSession()` lee la
 * cookie y confía en lo que dice, y la cookie la manda el navegador.
 * `getUser()` le pregunta a Supabase si ese token es válido. Para decidir si
 * alguien puede ver las reservas de un complejo, la diferencia es todo.
 */
export async function usuarioActual() {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
