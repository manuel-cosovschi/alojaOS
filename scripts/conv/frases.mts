/**
 * Las frases que ninguna página de venta de SOVARE puede decir. Las usan
 * `prueba-comercial` y `prueba-conv`: una sola lista, para que las dos páginas
 * se midan con la misma vara.
 */

/**
 * Testimonios inventados, números de resultados que no medimos y «más de X
 * negocios». No tenemos nada de eso, y la página se cae con una sola pregunta
 * si lo dice. Cada patrón tiene al lado un ejemplo de lo que caza, y la prueba
 * 2 comprueba que lo siga cazando: un detector que no detecta nada pasa siempre.
 */
export const PROHIBIDAS: { patron: RegExp; ejemplo: string }[] = [
  { patron: /m[aá]s de\s+[\d.]+\s+(negocios|locales|clientes|pasteler[ií]as|emprendimientos|usuarios)/i, ejemplo: 'Más de 50 negocios ya lo usan' },
  { patron: /[\d.]+\+?\s+(negocios|locales|clientes|pasteler[ií]as)\s+(conf[ií]an|lo usan|ya usan|eligen)/i, ejemplo: '120 negocios confían en nosotros' },
  { patron: /(ahorr[aá]s?|ahorrar|gan[aá]s?|aument[aá]s?|vend[eé]s?)\s+(hasta\s+)?(un\s+)?[\d.,]+\s*(%|horas|hs|veces)/i, ejemplo: 'Ahorrá 10 horas por semana' },
  { patron: /[\d.,]+\s*%\s+m[aá]s\s+(de\s+)?(ventas|pedidos|ganancia|clientes)/i, ejemplo: '30 % más de ventas' },
  { patron: /\b(el|la) m[aá]s (elegid[oa]|vendid[oa]|usad[oa])\b/i, ejemplo: 'El más elegido' },
  { patron: /casi todo el mundo|miles de (negocios|clientes|usuarios)/i, ejemplo: 'Es el que toma casi todo el mundo' },
  { patron: /lo que dicen (nuestros|los) clientes|testimonios?\b|★★★★★|5 estrellas/i, ejemplo: 'Lo que dicen nuestros clientes' },
];

export function frasesProhibidas(texto: string): string[] {
  return PROHIBIDAS.flatMap(({ patron }) => {
    const m = texto.match(patron);
    return m ? [`«${m[0]}» (${patron})`] : [];
  });
}
