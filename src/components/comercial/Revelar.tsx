'use client';

/**
 * Lo que hace que las cosas aparezcan al scrollear.
 *
 * ==================================================================
 * Un observador para toda la página, no un componente por bloque
 * ==================================================================
 * El estado escondido lo pone el CSS a cualquier elemento con `data-revelar`
 * (ver `globals.css`). Eso quiere decir que marcar un bloque para que aparezca
 * es agregarle un atributo, sin convertirlo en componente de cliente: la página
 * comercial sigue siendo HTML que el servidor arma entero, y lo único que corre
 * en el navegador es esto.
 *
 * ==================================================================
 * Las tres cosas que pueden salir mal, y qué hace cada una
 * ==================================================================
 *   1. **Que JavaScript no corra.** El CSS esconde sólo bajo `.con-js`, y esa
 *      clase la pone el guion de `Comercial.tsx` antes de pintar. Sin
 *      JavaScript no se esconde nada.
 *   2. **Que el observador no exista** (navegador viejo). Se revela todo de
 *      una y listo.
 *   3. **Que algo quede escondido igual** —un bloque dentro de un contenedor
 *      con `overflow`, un alto que el navegador calcula raro—. Por eso hay una
 *      red: a los tres segundos se revela todo lo que falte, pase lo que pase.
 *      Una animación que se traga una sección es peor que no tener animación.
 */

import { useEffect } from 'react';

/** Cuánto esperar antes de revelar por las dudas todo lo que quedó escondido. */
const RED_DE_SEGURIDAD = 3000;

export function Revelar() {
  useEffect(() => {
    const todos = () => Array.from(document.querySelectorAll<HTMLElement>('[data-revelar]'));
    const mostrar = (el: HTMLElement) => el.setAttribute('data-visible', '');

    if (typeof IntersectionObserver === 'undefined') {
      todos().forEach(mostrar);
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          mostrar(e.target as HTMLElement);
          // Una vez que apareció, deja de observarse: no se vuelve a esconder
          // al scrollear para arriba. Una sección que se desvanece cuando
          // volvés a ella se siente rota, no animada.
          observador.unobserve(e.target);
        }
      },
      // Se dispara un poco antes de que el bloque llegue al borde de abajo:
      // así la animación termina cuando el bloque está a la vista, y no
      // empieza recién ahí.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
    );

    todos().forEach((el) => observador.observe(el));

    const red = window.setTimeout(() => todos().forEach(mostrar), RED_DE_SEGURIDAD);

    return () => {
      observador.disconnect();
      window.clearTimeout(red);
    };
  }, []);

  return null;
}
