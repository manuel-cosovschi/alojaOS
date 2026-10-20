/**
 * Los eventos de conversión, con los mismos nombres en todos los productos.
 *
 * Se usan los nombres estándar de Meta (`Lead`, `InitiateCheckout`, `Purchase`)
 * porque son los que la plataforma sabe optimizar, y se mandan iguales a GA4 y
 * a `dataLayer`. Lo mismo en AlojaOS: un mismo evento significa lo mismo en los
 * dos sitios, y las campañas se pueden comparar.
 *
 * | Evento             | Cuándo                                              |
 * |--------------------|-----------------------------------------------------|
 * | `PageView`         | al abrir la página (lo manda el píxel solo)          |
 * | `ViewContent`      | al ver la sección de planes                          |
 * | `Contact`          | al tocar WhatsApp o mail                             |
 * | `Demo`             | al abrir la demo                                     |
 * | `InitiateCheckout` | al tocar «Contratar» un plan                          |
 * | `Lead`             | **cuando el servidor confirmó** que guardó la consulta |
 * | `Purchase`         | sólo desde el servidor, cuando el pago se aprueba    |
 *
 * `Lead` lleva un `eventId` que también usa el servidor al mandarlo por la API
 * de conversiones: Meta descarta el duplicado y cuenta uno solo.
 *
 * Nunca se manda un dato de la persona (nombre, teléfono, mail): sólo qué hizo,
 * en qué producto y de qué campaña vino.
 */

import type { Atribucion } from './atribucion';

export type NombreDeEvento = 'ViewContent' | 'Contact' | 'Demo' | 'InitiateCheckout' | 'Lead';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Eventos que no son estándar de Meta: van como `trackCustom`. */
const PROPIOS = new Set<NombreDeEvento>(['Demo']);

/** Los que ya salieron en esta página: un doble clic no cuenta dos veces. */
const enviados = new Set<string>();

export function rastrear(
  evento: NombreDeEvento,
  datos: { producto: string; atribucion?: Atribucion; plan?: string; valor?: number; eventId?: string; [k: string]: unknown },
  { unaVez = true }: { unaVez?: boolean } = {}
): void {
  if (typeof window === 'undefined') return;
  const clave = datos.eventId ?? `${evento}:${datos.plan ?? ''}`;
  if (unaVez && enviados.has(clave)) return;
  enviados.add(clave);

  const { atribucion, eventId, ...resto } = datos;
  const parametros = {
    ...resto,
    ...(datos.valor ? { value: datos.valor, currency: 'ARS' } : {}),
    utm_source: atribucion?.utm_source,
    utm_campaign: atribucion?.utm_campaign,
    variante: atribucion?.variante,
  };

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event: evento, ...parametros, event_id: eventId });

  if (window.fbq) {
    window.fbq(PROPIOS.has(evento) ? 'trackCustom' : 'track', evento, parametros, eventId ? { eventID: eventId } : undefined);
  }
  if (window.gtag) {
    window.gtag('event', NOMBRES_GA4[evento], parametros);
  }
}

/** GA4 tiene sus propios nombres recomendados. */
const NOMBRES_GA4: Record<NombreDeEvento, string> = {
  ViewContent: 'view_item_list',
  Contact: 'contact',
  Demo: 'demo_open',
  InitiateCheckout: 'begin_checkout',
  Lead: 'generate_lead',
};
