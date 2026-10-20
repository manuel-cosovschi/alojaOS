/**
 * Las variantes del titular de `/conv`, elegidas por el anuncio con `?v=`.
 *
 * Mismo criterio que GastroOS: no hay reparto al azar ni ganadora declarada.
 * La variante viaja en la atribución y aparece en cada consulta guardada. Ninguna
 * puede prometer algo que el sistema no hace.
 */

export const VARIANTES = {
  base: {
    para: 'Para complejos de 3 a 15 unidades',
    // El mismo titular que la página de inicio: quien llega de un anuncio y
    // después entra al home no tiene que leer otra promesa.
    titulo: 'Tu complejo se reserva',
    acento: 'mientras dormís.',
    bajada: 'Tu propia página de reservas, con tu nombre. El huésped elige las noches, ve el precio, transfiere la seña a tu cuenta y vos confirmás desde el teléfono.',
  },
  comision: {
    para: 'Para complejos que hoy le pagan a un portal',
    titulo: 'Tus reservas,',
    acento: 'sin comisión por cada una',
    bajada: 'Una página propia donde el huésped reserva y la seña va directo a tu cuenta. Pagás un número fijo por mes, vendas mucho o poco.',
  },
  whatsapp: {
    para: 'Para los que atienden las reservas por WhatsApp',
    titulo: 'Dejá de contestar',
    acento: '«¿está libre?» todo el día',
    bajada: 'El huésped ve en tu página qué noches están libres y cuánto sale. Te llega la reserva con el comprobante y la confirmás con un botón.',
  },
} as const;

export type ClaveDeVariante = keyof typeof VARIANTES;

export function varianteDe(v: string | undefined): ClaveDeVariante {
  return v && v in VARIANTES ? (v as ClaveDeVariante) : 'base';
}
