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

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) video.play().catch(() => {});
          else video.pause();
        }
      },
      { threshold: 0.25 }
    );
    observador.observe(video);
    return () => observador.disconnect();
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
