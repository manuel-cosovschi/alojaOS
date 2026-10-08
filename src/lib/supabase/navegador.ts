/**
 * El cliente del navegador, para el login.
 *
 * Lo único que hace desde el navegador es iniciar y cerrar sesión: una vez que
 * hay sesión, todo lo que lee el panel lo lee el servidor. Es a propósito —si
 * el navegador consultara las reservas él mismo, la lista de huéspedes viajaría
 * al cliente y quedaría en su caché— y es por eso que este archivo es tan corto.
 */

import { createBrowserClient } from '@supabase/ssr';

export function clienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
