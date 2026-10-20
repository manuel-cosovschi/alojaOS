'use client';

/**
 * El cartel de arriba del panel cuando la sesión es una demo.
 *
 * Dice lo que es —una copia tuya, con datos inventados, que nadie más ve— y
 * tiene las cuatro salidas que una demo necesita: volver a la guía, empezar de
 * cero, irse, y pedir el de verdad. La última es la razón de que exista la
 * demo, así que es la que tiene color.
 */

import { useActionState } from 'react';
import { reiniciarLaDemo, salirDeLaDemo, type ResultadoDemo } from '@/actions/demo';
import { BotonGuia } from './Guia';

export function CartelDeDemo({ whatsapp }: { whatsapp: string }) {
  const [error, reiniciar, reiniciando] = useActionState<ResultadoDemo | null>(
    async (previo) => (await reiniciarLaDemo(previo)) ?? null,
    null
  );

  return (
    <div className="bg-[#1b2b26] px-4 py-3 text-white sm:px-8" data-cartel-demo>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-snug">
          <strong>Estás en una demo.</strong>{' '}
          <span className="opacity-80">Es una copia tuya con datos inventados: probá lo que quieras.</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <BotonGuia />
          <form action={reiniciar}>
            <button
              type="submit"
              disabled={reiniciando}
              className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25 disabled:opacity-60"
            >
              {reiniciando ? 'Reiniciando…' : 'Reiniciar'}
            </button>
          </form>
          <form action={salirDeLaDemo}>
            <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-semibold opacity-80 hover:opacity-100">
              Salir
            </button>
          </form>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener"
            className="rounded-lg bg-[#c2703d] px-3 py-1.5 text-sm font-semibold hover:bg-[#b0602f]"
          >
            Quiero el mío
          </a>
        </div>
      </div>
      {error && <p className="mx-auto mt-2 max-w-4xl text-sm text-amber-200">{error.mensaje}</p>}
    </div>
  );
}
