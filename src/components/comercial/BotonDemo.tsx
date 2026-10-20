'use client';

/**
 * El botón que abre el demo guiado.
 *
 * Arma una copia del complejo de ejemplo para quien lo toca, le abre la sesión
 * como dueño y lo lleva al panel con la guía abierta (ver `src/actions/demo.ts`).
 * Tarda un par de segundos —es copiar un complejo entero—, así que el botón lo
 * dice mientras tanto: un botón que no responde se toca otra vez.
 */

import { useActionState } from 'react';
import { entrarALaDemo, type ResultadoDemo } from '@/actions/demo';
import { NOCHE } from '@/lib/marca-alojaos';
import { Flecha } from './Iconos';

export function BotonDemo({ texto = 'Abrir el demo guiado' }: { texto?: string }) {
  const [error, entrar, armando] = useActionState<ResultadoDemo | null>(
    async (previo) => (await entrarALaDemo(previo)) ?? null,
    null
  );

  return (
    <form action={entrar}>
      <button
        type="submit"
        disabled={armando}
        data-boton-demo
        className="inline-flex items-center gap-2.5 rounded-xl px-6 py-3.5 text-[15px] font-bold transition hover:brightness-110 disabled:opacity-70"
        style={{ background: NOCHE.accion, color: '#fff' }}
      >
        {armando ? 'Armando tu demo…' : texto}
        {!armando && <Flecha />}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: '#f2b8a2' }}>
          {error.mensaje}
        </p>
      )}
    </form>
  );
}
