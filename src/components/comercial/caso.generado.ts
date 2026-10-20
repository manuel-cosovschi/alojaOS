/**
 * Lo que se muestra del sistema de Las Cañas.
 *
 * GENERADO por `npm run caso`, que recorre lascaniasmardecobo.com sin
 * escribir nada. Editarlo a mano no saca ninguna captura.
 */

export const CASO_GRABADO_EL = '2026-10-20';

export const CASO_SITIO = "https://lascaniasmardecobo.com";

/** Con la misma forma que una entrada de `VIDEOS`, para que la muestre el mismo componente. */
export const CASO_VIDEO = {
  mp4: '/caso/las-canas.mp4',
  webm: '/caso/las-canas.webm',
  poster: '/caso/las-canas.jpg',
  ancho: 780,
  alto: 1560,
  que: 'Un huésped entrando a la página de Las Cañas, eligiendo casa, personas y noches, y viendo el precio',
  de: "https://lascaniasmardecobo.com/",
} as const;

export const CASO_CAPTURAS = {
  inicio: { src: '/caso/las-canas-inicio.jpg', ancho: 1920, alto: 1200, que: 'La portada de lascaniasmardecobo.com' },
  precio: { src: '/caso/las-canas-precio.jpg', ancho: 780, alto: 1560, que: 'La reserva en Las Cañas: casa, personas, noches y precio estimado' },
} as const;
