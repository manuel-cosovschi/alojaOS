'use client';

/**
 * Un video del sistema andando, y el demo de verdad embebido.
 *
 * ==================================================================
 * Por qué son componentes de cliente
 * ==================================================================
 * Los dos necesitan saber algo que sólo se sabe en el navegador: uno, si la
 * persona pidió que las cosas no se muevan; el otro, si ya tocó el botón. Todo
 * lo demás de esta página lo arma el servidor.
 */

import { useEffect, useRef, useState } from 'react';
import { NOCHE } from '@/lib/marca-alojaos';
import { VIDEOS } from './videos.generado';
import { CASO_VIDEO } from './caso.generado';
import { Flecha } from './Iconos';

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

/**
 * El demo de verdad, adentro de la página.
 *
 * ==================================================================
 * Por qué no se carga solo
 * ==================================================================
 * Un `iframe` que arranca con la página carga un sitio entero —con su base de
 * datos del otro lado— para alguien que a lo mejor nunca llega a esa sección.
 * Así que hasta que no lo tocan, esto es una imagen y un botón.
 *
 * Y cuando lo tocan, lo que aparece no es una simulación: es
 * `cabanias-del-sol.alojaos.shop`, el mismo sitio que se abre en otra pestaña,
 * con el mismo calendario y la misma base. Se puede reservar desde acá.
 *
 * El enlace de «abrirlo en otra pestaña» queda igual, porque un iframe de 300
 * píxeles en un celular es incómodo y porque hay gente que no confía en algo
 * embebido — y tiene razón en no confiar.
 */
export function DemoEmbebido({ direccion }: { direccion: string }) {
  const [prendido, setPrendido] = useState(false);

  return (
    <div className="relative">
      {prendido ? (
        <iframe
          src={direccion}
          title="El demo de AlojaOS, en vivo"
          className="h-[640px] w-full border-0"
          // `sandbox` no se pone: el demo es nuestro, y restringirlo le sacaría
          // justo lo que tiene que hacer —escribir en la base al reservar—.
          loading="lazy"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPrendido(true)}
          className="group flex h-[640px] w-full flex-col items-center justify-center gap-4 px-6 text-center transition hover:bg-white/5"
          style={{ background: 'rgba(255,255,255,.02)' }}
        >
          <span
            className="inline-flex items-center gap-2.5 rounded-xl px-5 py-3 text-[15px] font-bold text-white"
            style={{ background: NOCHE.accion }}
          >
            Probar el demo acá
            <Flecha />
          </span>
          <span className="max-w-xs text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>
            Se abre el sistema de verdad, con su calendario y su base. Podés
            reservar y ver qué le llega al dueño.
          </span>
        </button>
      )}
    </div>
  );
}
