/**
 * Qué complejo está pidiendo esta página.
 *
 * Cada complejo tiene su página en `sucomplejo.alojaos.shop`. El subdominio es
 * lo único que decide qué datos se leen, así que es una decisión de seguridad,
 * no de enrutamiento: si se pudiera influir desde afuera, un visitante vería
 * los datos de otro complejo.
 *
 * Tres reglas, y las tres importan:
 *
 *   1. El slug sale del `Host` de la petición, no de un parámetro ni de una
 *      cabecera que llegue de afuera. El middleware **borra** la cabecera
 *      `x-complejo` que venga del cliente antes de escribir la suya.
 *   2. Un subdominio reservado (`www`, `admin`, `api`, el mail…) no es un
 *      complejo. Si lo fuera, alguien podría registrar el complejo `admin` y
 *      quedarse con una dirección que confunde a quien la lea.
 *   3. Lo que no es la página pública de un complejo —el panel, el login, la
 *      página comercial— se va al dominio principal. La sesión nunca queda
 *      atada a un subdominio.
 */

import { SLUGS_RESERVADOS, slugReservado } from './constants';

/** La cabecera donde el middleware deja el slug para el servidor. */
export const CABECERA_COMPLEJO = 'x-complejo';

const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Si una cadena puede ser el slug de un complejo. Mismo criterio que la base. */
export function slugValido(slug: string): boolean {
  return (
    SLUG_VALIDO.test(slug) &&
    slug.length >= 3 &&
    slug.length <= 40 &&
    !slugReservado(slug)
  );
}

/**
 * El dominio raíz del que cuelgan las páginas de los complejos.
 *
 * Sale de la variable de entorno y no de una constante porque en local es
 * `alojaos.test:3000` y en producción el dominio de verdad. Si las páginas
 * cuelgan de otro dominio que el sitio, `NEXT_PUBLIC_ROOT_DOMAIN` lo dice.
 */
export function dominioRaiz(): string {
  const explicito = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (explicito) return limpiarHost(explicito);

  const sitio = process.env.NEXT_PUBLIC_SITE_URL;
  if (!sitio) return '';
  try {
    return limpiarHost(new URL(sitio).host);
  } catch {
    return '';
  }
}

/** Saca el protocolo, el puerto y el punto final, y pasa a minúsculas. */
function limpiarHost(valor: string): string {
  return valor
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

/**
 * El slug del complejo que corresponde a un `Host`, o null si es el dominio
 * principal, un subdominio reservado o un host que no reconocemos.
 *
 * Devolver null para lo que no reconocemos —y no, por ejemplo, el primer
 * segmento— es a propósito: un `Host` es un dato del cliente, y de un dato del
 * cliente no se deduce de qué complejo son las reservas que vamos a mostrar.
 */
export function complejoDelHost(host: string | null | undefined): string | null {
  if (!host) return null;

  const limpio = limpiarHost(host);
  const raiz = dominioRaiz();
  if (!raiz) return null;

  // El dominio principal no es un complejo.
  if (limpio === raiz) return null;

  if (!limpio.endsWith(`.${raiz}`)) return null;

  const resto = limpio.slice(0, -(raiz.length + 1));
  // Un solo nivel: `a.b.alojaos.shop` no es el complejo `a.b`.
  if (resto.includes('.')) return null;

  return slugValido(resto) ? resto : null;
}

/** La dirección pública de un complejo, para mostrarla o mandarla por mensaje. */
export function direccionDelComplejo(slug: string): string {
  const sitio = process.env.NEXT_PUBLIC_SITE_URL || '';
  const raiz = dominioRaiz();
  if (!raiz) return '';

  let protocolo = 'https:';
  let puerto = '';
  try {
    const u = new URL(sitio);
    protocolo = u.protocol;
    puerto = u.port ? `:${u.port}` : '';
  } catch {
    /* sin NEXT_PUBLIC_SITE_URL legible, se asume https y sin puerto */
  }

  return `${protocolo}//${slug}.${raiz}${puerto}`;
}

export { SLUGS_RESERVADOS, slugReservado };
