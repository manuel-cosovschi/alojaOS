'use client';

/**
 * Un video del sistema andando.
 *
 * Es de cliente porque necesita saber algo que sólo se sabe en el navegador:
 * si la persona pidió que las cosas no se muevan.
 */

import { useEffect, useRef, useState } from 'react';
import { VIDEOS } from './videos.generado';
import { CASO_VIDEO } from './caso.generado';

/** Los del demo y el del caso, que sale del sitio de Las Cañas con otro script. */
const TODOS = { ...VIDEOS, 'las-canas': CASO_VIDEO };

type Clave = keyof typeof TODOS;

/**
 * Cuando el teléfono no deja arrancarlo solo.
 *
 * Con «Ahorro de batería» o «Datos reducidos», iOS frena todo video que arranca
 * solo, aunque esté sin sonido: `play()` se rechaza y el video queda en el
 * primer cuadro con el botón de play encima. No hay forma de saltear eso, y no
 * hay que buscarla: es lo que la persona eligió. Lo que sí se puede es no
 * pedirle que encuentre el video y lo toque: el primer toque en cualquier
 * parte de la página es un gesto suyo, y con un gesto `play()` sí anda.
 *
 * `frenados` son los que todavía no arrancaron nunca, se hayan visto o no: el
 * gesto los destraba a todos juntos. iOS destraba video por video, y uno que
 * llega a la pantalla después del toque volvería a pedir otro.
 */
const frenados = new Set<HTMLVideoElement>();
const visibles = new WeakSet<HTMLVideoElement>();
let hayEscuchas = false;

function destrabar() {
  for (const video of frenados) {
    // Arrancarlo dentro del gesto lo destraba para siempre. Si en ese momento
    // no está en pantalla, se frena enseguida: queda listo para cuando llegue.
    video
      .play()
      .then(() => {
        frenados.delete(video);
        if (!visibles.has(video)) video.pause();
        if (frenados.size === 0) quitarEscuchas();
      })
      .catch(() => {});
  }
}

// Las escuchas se ponen recién cuando un video no pudo arrancar solo: en un
// teléfono que los deja arrancar, la página no escucha ningún toque de más.
function ponerEscuchas() {
  if (hayEscuchas) return;
  hayEscuchas = true;
  document.addEventListener('touchend', destrabar, { passive: true });
  document.addEventListener('click', destrabar);
}
function quitarEscuchas() {
  hayEscuchas = false;
  document.removeEventListener('touchend', destrabar);
  document.removeEventListener('click', destrabar);
}

/**
 * El video, en bucle y sin sonido.
 *
 * ------------------------------------------------------------------
 * Las tres cosas que lo hacen inofensivo
 * ------------------------------------------------------------------
 *   1. **`preload="none"` y `poster`.** El archivo no se baja hasta que el
 *      video entra en pantalla; mientras tanto se ve el primer cuadro, que pesa
 *      siete kilobytes. Un video que se baja al abrir la página le cuesta medio
 *      mega a alguien que quizás no llega a scrollear hasta él.
 *   2. **Arranca cuando se ve, y se frena cuando deja de verse.** Un video en
 *      bucle fuera de pantalla gasta batería para nadie.
 *   3. **Con `prefers-reduced-motion` no se reproduce**: queda el póster y los
 *      controles, para quien quiera verlo igual. Esa preferencia no es un
 *      gusto: hay gente a la que el movimiento le da náuseas.
 *
 * `muted` + `playsInline` no son decoración: sin los dos, iOS **no** reproduce
 * un video automáticamente, y quedaría un cuadro quieto sin que nada falle.
 */
export function Video({ cual, className = '' }: { cual: Clave; className?: string }) {
  const v = TODOS[cual];
  const ref = useRef<HTMLVideoElement>(null);
  const [quieto, setQuieto] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setQuieto(sinMovimiento);
    if (sinMovimiento) return;
    frenados.add(video);

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            visibles.add(video);
            video
              .play()
              .then(() => frenados.delete(video))
              .catch(() => ponerEscuchas());
          } else {
            visibles.delete(video);
            video.pause();
          }
        }
      },
      { threshold: 0.25 }
    );
    observador.observe(video);
    return () => {
      observador.disconnect();
      frenados.delete(video);
      if (frenados.size === 0) quitarEscuchas();
    };
  }, []);

  return (
    <video
      ref={ref}
      width={v.ancho}
      height={v.alto}
      poster={v.poster}
      preload="none"
      muted
      loop
      playsInline
      controls={quieto}
      aria-label={v.que}
      className={`h-auto w-full ${className}`}
    >
      {/* El mp4 va primero: es el que anda en todos lados. El navegador que
          puede con el webm lo toma porque pesa menos; el que no, sigue de
          largo. */}
      <source src={v.mp4} type="video/mp4" />
      <source src={v.webm} type="video/webm" />
    </video>
  );
}
