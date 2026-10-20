'use client';

/**
 * La visita guiada del panel.
 *
 * ==================================================================
 * Cómo se ve
 * ==================================================================
 * Una tarjeta abajo de la pantalla con el paso, y un recuadro que ilumina la
 * parte del panel de la que habla; el resto se oscurece. El panel es una sola
 * página, así que la guía no navega: lleva el scroll hasta cada parte.
 *
 * ==================================================================
 * Lo que NO hace, a propósito
 * ==================================================================
 * **No bloquea el panel.** La capa oscura no atrapa los toques: se puede
 * confirmar una seña o cerrar una fecha con la guía abierta. La guía invita a
 * probar, y una guía que no deja tocar lo que señala es un video con pasos.
 *
 * **No se impone.** Arranca sola la primera vez que se entra a una demo
 * (`?guia=1`), y después sólo si se la pide con el botón «Guía». Se cierra con
 * Escape o con «Salir de la guía», y recuerda el paso en el navegador: recargar
 * no devuelve al principio. `localStorage` va en try/catch porque en una
 * ventana privada puede tirar, y perder el progreso es mucho mejor que perder
 * el panel.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CLAVE_DE_LA_GUIA, PASOS_DE_LA_GUIA } from '@/lib/guia';

/** El evento con el que el botón «Guía» del cartel de demo la abre. */
export const ABRIR_LA_GUIA = 'alojaos:abrir-guia';

interface Progreso {
  vista?: boolean;
  paso?: number;
}

function leer(): Progreso {
  try {
    return JSON.parse(window.localStorage.getItem(CLAVE_DE_LA_GUIA) ?? '{}') as Progreso;
  } catch {
    return {};
  }
}

function guardar(p: Progreso) {
  try {
    window.localStorage.setItem(CLAVE_DE_LA_GUIA, JSON.stringify(p));
  } catch {
    // Sin almacenamiento la guía anda igual; sólo no recuerda el paso.
  }
}

interface Recuadro {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function Guia({
  arrancarSola,
  paginaDelHuesped,
}: {
  /** Abrir la guía sola si este navegador todavía no la vio. */
  arrancarSola: boolean;
  /** La dirección de la página del complejo, para el último paso. */
  paginaDelHuesped: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const [indice, setIndice] = useState(0);
  const [recuadro, setRecuadro] = useState<Recuadro | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  const total = PASOS_DE_LA_GUIA.length;
  const paso = abierta ? PASOS_DE_LA_GUIA[indice] : null;

  const abrir = useCallback(
    (desde = 0) => {
      setIndice(Math.min(Math.max(desde, 0), total - 1));
      setAbierta(true);
    },
    [total]
  );

  const cerrar = useCallback(() => {
    setAbierta(false);
    guardar({ vista: true, paso: 0 });
  }, []);

  const ir = useCallback(
    (a: number) => {
      if (a >= total) return cerrar();
      const destino = Math.max(a, 0);
      setIndice(destino);
      guardar({ paso: destino });
    },
    [total, cerrar]
  );

  // Arranque solo: la primera vez, y con un respiro para que el panel termine
  // de pintarse. Iluminar algo que todavía se está acomodando deja el
  // recuadro corrido.
  useEffect(() => {
    if (!arrancarSola) return;
    const p = leer();
    if (p.vista) return;
    const t = window.setTimeout(() => abrir(p.paso ?? 0), 700);
    return () => window.clearTimeout(t);
  }, [arrancarSola, abrir]);

  // El botón «Guía» del cartel, que vive en otro componente.
  useEffect(() => {
    const alAbrir = () => abrir(0);
    window.addEventListener(ABRIR_LA_GUIA, alAbrir);
    return () => window.removeEventListener(ABRIR_LA_GUIA, alAbrir);
  }, [abrir]);

  // Llevar el scroll hasta lo que el paso señala.
  useEffect(() => {
    if (!paso) return;
    tituloRef.current?.focus({ preventScroll: true });
    if (paso.forma !== 'foco' || !paso.objetivo) {
      setRecuadro(null);
      return;
    }
    const el = document.querySelector(`[data-guia="${paso.objetivo}"]`);
    if (!el) {
      setRecuadro(null);
      return;
    }
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const y = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top: Math.max(y, 0), behavior: sinMovimiento ? 'auto' : 'smooth' });
  }, [paso]);

  // Y seguirlo: el recuadro se recalcula al scrollear, al cambiar el tamaño
  // de la ventana y cuando el panel se vuelve a pintar después de confirmar
  // algo. Un recuadro que se queda donde estaba el elemento hace un segundo
  // ilumina otra cosa.
  useEffect(() => {
    if (!paso || paso.forma !== 'foco' || !paso.objetivo) return;
    const medir = () => {
      const el = document.querySelector(`[data-guia="${paso.objetivo}"]`);
      if (!el) return setRecuadro(null);
      const r = el.getBoundingClientRect();
      setRecuadro({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    };
    medir();
    const intervalo = window.setInterval(medir, 300);
    window.addEventListener('scroll', medir, { passive: true });
    window.addEventListener('resize', medir);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
    };
  }, [paso]);

  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta, cerrar]);

  if (!paso) return null;

  const ultimo = indice === total - 1;

  return (
    <>
      {/* La capa oscura. `pointer-events: none` es la decisión central: se ve
          oscura, pero los toques pasan al panel. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-40">
        {recuadro ? (
          <div
            className="absolute rounded-2xl transition-all duration-200"
            style={{
              top: recuadro.top,
              left: recuadro.left,
              width: recuadro.width,
              height: recuadro.height,
              boxShadow: '0 0 0 9999px rgba(15,25,22,.55)',
              outline: '3px solid #c2703d',
            }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: 'rgba(15,25,22,.55)' }} />
        )}
      </div>

      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="guia-titulo"
        data-guia-tarjeta={paso.id}
        className={[
          'fixed z-50 w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-5 text-[#1b2b26] shadow-2xl',
          paso.forma === 'centro'
            ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
            : 'bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#2f5d50]">
            Guía · {indice + 1} de {total}
          </p>
          <button type="button" onClick={cerrar} className="text-xs underline opacity-60 hover:opacity-100">
            Salir de la guía
          </button>
        </div>

        {/* La barra de progreso: sin ella, «4 de 11» no dice cuánto falta. */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/10" aria-hidden>
          <div className="h-full bg-[#c2703d] transition-all" style={{ width: `${((indice + 1) / total) * 100}%` }} />
        </div>

        <h2 id="guia-titulo" ref={tituloRef} tabIndex={-1} className="mt-4 text-lg font-semibold leading-snug outline-none">
          {paso.titulo}
        </h2>
        <p className="mt-2 text-sm leading-relaxed opacity-80">{paso.texto}</p>
        {paso.pista && <p className="mt-3 text-sm font-medium text-[#2f5d50]">{paso.pista}</p>}

        {ultimo && (
          <a
            href={paginaDelHuesped}
            target="_blank"
            rel="noopener"
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#2f5d50] px-4 py-3 text-sm font-semibold text-white"
          >
            Abrir mi página como huésped ↗
          </a>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => ir(indice - 1)}
            disabled={indice === 0}
            className="rounded-xl px-3 py-2 text-sm font-medium opacity-70 hover:opacity-100 disabled:invisible"
          >
            ← Anterior
          </button>
          <button
            type="button"
            onClick={() => ir(indice + 1)}
            className="rounded-xl bg-[#1b2b26] px-4 py-2 text-sm font-semibold text-white"
          >
            {ultimo ? 'Terminar' : indice === 0 ? 'Empezar' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </>
  );
}

/** El botón «Guía» del cartel de demo. */
export function BotonGuia() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ABRIR_LA_GUIA))}
      className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25"
    >
      Guía
    </button>
  );
}
