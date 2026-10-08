/**
 * Valores por defecto de la instancia. No son la identidad de ningún complejo:
 * eso vive en la fila de `complejos`. Son el fallback de cuando todavía no hay
 * complejo resuelto (la página comercial, un error antes de leer la base).
 */

export const ZONA_HORARIA_POR_DEFECTO = 'America/Argentina/Buenos_Aires';
export const MONEDA_POR_DEFECTO = 'ARS';
export const LOCALE_POR_DEFECTO = 'es-AR';

/** Los estados en que una reserva ocupa la unidad y no deja entrar a otra. */
export const ESTADOS_QUE_OCUPAN = ['HOLD_TRANSFER', 'CONFIRMED', 'BLOCKED'] as const;

export type EstadoReserva =
  | 'HOLD_TRANSFER'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'BLOCKED';

export const NOMBRE_ESTADO: Record<EstadoReserva, string> = {
  HOLD_TRANSFER: 'Esperando la seña',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Vencida',
  BLOCKED: 'Bloqueada por el dueño',
};

/**
 * Subdominios que no pueden ser un complejo: ya tienen otro dueño (la propia
 * página, el mail, el panel) o confundirían a quien los lea. Misma lista que
 * `sovare.slug_reservado()` del lado de la base: si se toca una, se toca la otra.
 */
export const SLUGS_RESERVADOS = [
  'www', 'app', 'admin', 'api', 'panel', 'sovare', 'alojaos', 'gastroos',
  'mail', 'email', 'send', 'smtp', 'imap', 'pop', 'mx', 'ns1', 'ns2', 'ftp',
  'hola', 'soporte', 'ayuda', 'contacto', 'info', 'ventas', 'billing',
  'login', 'salir', 'contratar', 'alta', 'reservar', 'reservas',
  'demo', 'test', 'prueba', 'staging', 'dev', 'static',
  'cdn', 'assets', 'status', 'blog', 'docs', 'resend', 'dashboard', 'cuenta',
] as const;

export function slugReservado(slug: string): boolean {
  return (SLUGS_RESERVADOS as readonly string[]).includes(slug) || slug.startsWith('demo-');
}

// ---------------------------------------------------------------------------
// Por dónde nos escribe un cliente
// ---------------------------------------------------------------------------
// Acá y no en la página comercial, porque el mismo dato va en varios lugares y
// el día que cambie el número tiene que cambiar en uno.
//
// Salen de variables de entorno con un valor por defecto que es el de SOVARE:
// el producto se puede revender, y quien lo revenda pone su número sin tocar el
// código. Si la variable no está, al menos no queda un enlace vacío.
export const WHATSAPP_CONTACTO =
  process.env.NEXT_PUBLIC_WHATSAPP_CONTACTO || '5492235000000';

export const MAIL_CONTACTO =
  process.env.NEXT_PUBLIC_MAIL_CONTACTO || 'hola@sovare.studio';

/**
 * El enlace de WhatsApp, con un mensaje puesto.
 *
 * El mensaje pre-escrito no es para ahorrarle tipeo a nadie: es para que quien
 * atiende sepa de dónde viene la persona sin preguntar. Alguien que escribe
 * desde la página comercial tiene una conversación distinta de alguien que
 * escribe desde la página de un complejo.
 */
export const ENLACE_WHATSAPP = `https://wa.me/${WHATSAPP_CONTACTO}?text=${encodeURIComponent(
  'Hola, vi AlojaOS y quiero saber más.'
)}`;
