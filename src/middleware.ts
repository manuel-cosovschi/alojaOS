/**
 * Qué complejo sirve esta petición, y qué rutas tiene permitido un subdominio.
 *
 * El subdominio decide qué datos se leen, así que lo que haga este archivo es
 * una decisión de seguridad. Dos cosas, las dos imprescindibles:
 *
 *   1. **Se borra la cabecera que llegue de afuera.** `x-complejo` es la que
 *      el servidor usa para saber de qué complejo mostrar las reservas. Si un
 *      visitante pudiera mandarla, elegiría él qué complejo leer. Se borra
 *      siempre, antes de escribir la nuestra, incluso cuando no hay complejo.
 *   2. **Un subdominio sirve sólo su página pública.** El panel, el login y la
 *      página comercial se van al dominio principal, así que la sesión del
 *      dueño nunca queda atada a un subdominio ni se puede leer desde uno.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { CABECERA_COMPLEJO, complejoDelHost } from './lib/tenant';

/** Lo que sólo vive en el dominio principal. */
const SOLO_DOMINIO_PRINCIPAL = [
  '/panel',
  '/login',
  '/salir',
  '/contratar',
  '/alta',
  '/api/interno',
];

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const complejo = complejoDelHost(req.headers.get('host'));

  const cabeceras = new Headers(req.headers);
  // Primero borrar, después escribir. Nunca al revés.
  cabeceras.delete(CABECERA_COMPLEJO);

  if (!complejo) {
    return NextResponse.next({ request: { headers: cabeceras } });
  }

  // En un subdominio, todo lo que no sea la página del complejo se va al
  // dominio principal, con la ruta puesta.
  if (SOLO_DOMINIO_PRINCIPAL.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    const principal = new URL(process.env.NEXT_PUBLIC_SITE_URL || '/', req.url);
    principal.pathname = url.pathname;
    principal.search = url.search;
    return NextResponse.redirect(principal);
  }

  cabeceras.set(CABECERA_COMPLEJO, complejo);
  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  // Se excluyen los archivos estáticos y las imágenes: no leen datos de ningún
  // complejo y hacerlos pasar por acá sólo agrega latencia.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$).*)'],
};
