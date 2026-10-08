/**
 * Cerrar sesión.
 *
 * Es una ruta y no sólo la acción del servidor porque un `<a href="/salir">` de
 * algún lado tiene que funcionar igual. Siempre redirige al login, incluso si
 * no había sesión: "salir" cuando ya saliste no es un error.
 */

import { NextResponse } from 'next/server';
import { clienteConSesion } from '@/lib/supabase/sesion';

export async function GET(pedido: Request) {
  const supabase = await clienteConSesion();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', pedido.url));
}

export const POST = GET;
