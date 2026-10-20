/**
 * De dónde vino el visitante: la campaña que lo trajo.
 *
 * Se guarda la **primera** visita de la sesión y no la última: si alguien entra
 * por un anuncio y después navega a otra página del sitio, la campaña que lo
 * trajo sigue siendo el anuncio, no «tráfico directo».
 *
 * Vive en `sessionStorage` y en una cookie de primera parte de 30 días. La
 * cookie es la que lee el servidor cuando llega el formulario; el
 * `sessionStorage` es lo que se usa del lado del navegador. Ninguna de las dos
 * guarda datos de la persona: sólo los parámetros de la dirección.
 */

export const CLAVES_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export interface Atribucion {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** Los identificadores de clic de Meta y Google, para atribuir la conversión. */
  fbclid?: string;
  gclid?: string;
  /** La variante de la página que vio (`?v=`), para los experimentos. */
  variante?: string;
  referrer?: string;
  landing?: string;
}

export const COOKIE_ATRIBUCION = 'conv_atrib';
const MAX_LARGO = 200;

/** Lee los parámetros de una dirección. Sirve igual en el navegador y en el servidor. */
export function atribucionDe(url: URL, referrer = ''): Atribucion {
  const a: Atribucion = {};
  for (const k of [...CLAVES_UTM, 'fbclid', 'gclid'] as const) {
    const v = url.searchParams.get(k)?.trim();
    if (v) a[k] = v.slice(0, MAX_LARGO);
  }
  const v = url.searchParams.get('v')?.trim();
  if (v && /^[a-z0-9-]{1,20}$/i.test(v)) a.variante = v;
  if (referrer) a.referrer = referrer.slice(0, MAX_LARGO);
  a.landing = url.pathname;
  return a;
}

/** Del navegador: la guarda la primera vez y después devuelve siempre esa. */
export function capturarAtribucion(): Atribucion {
  try {
    const guardada = sessionStorage.getItem(COOKIE_ATRIBUCION);
    if (guardada) return JSON.parse(guardada) as Atribucion;
    const a = atribucionDe(new URL(window.location.href), document.referrer);
    const json = JSON.stringify(a);
    sessionStorage.setItem(COOKIE_ATRIBUCION, json);
    document.cookie = `${COOKIE_ATRIBUCION}=${encodeURIComponent(json)}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax; Secure`;
    return a;
  } catch {
    // Navegación privada con el almacenamiento bloqueado: se atribuye esta
    // visita y nada más.
    return atribucionDe(new URL(window.location.href), document.referrer);
  }
}

/** Del servidor: lo que dejó la cookie, validado. Nunca tira. */
export function atribucionDeCookie(valor: string | undefined): Atribucion {
  if (!valor) return {};
  try {
    const crudo = JSON.parse(decodeURIComponent(valor)) as Record<string, unknown>;
    const a: Atribucion = {};
    for (const k of [...CLAVES_UTM, 'fbclid', 'gclid', 'variante', 'referrer', 'landing'] as const) {
      if (typeof crudo[k] === 'string') a[k] = (crudo[k] as string).slice(0, MAX_LARGO);
    }
    return a;
  } catch {
    return {};
  }
}

/** Una línea legible para anotar en el prospecto: «meta / cpc / pasteleria-oct». */
export function resumenDeAtribucion(a: Atribucion): string {
  const partes = [a.utm_source, a.utm_medium, a.utm_campaign, a.utm_content].filter(Boolean);
  if (partes.length) return partes.join(' / ');
  if (a.fbclid) return 'meta (sin utm)';
  if (a.gclid) return 'google (sin utm)';
  return a.referrer ? `referencia: ${a.referrer}` : 'directo';
}
