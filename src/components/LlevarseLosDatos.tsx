'use client';

/**
 * «Te vas cuando quieras y te llevás tus datos».
 *
 * Eso dice la página comercial, y hasta el 15/10 no había con qué: ninguna
 * función de exportación en todo el producto. No era falso —lo podíamos hacer a
 * mano con una consulta— pero era una promesa sin código atrás, y el día que un
 * cliente se vaya enojado va a querer el archivo en el momento, no cuando
 * podamos.
 *
 * Baja TODO lo del complejo en un JSON: sus datos, sus unidades, sus precios,
 * sus reglas, sus bloqueos y sus reservas con los huéspedes. Lo arma
 * `exportar_complejo()` en la base, que valida la pertenencia con `es_miembro()`
 * porque RLS no corre adentro de una función `SECURITY DEFINER`.
 *
 * Está abajo de todo en el panel a propósito: es lo que se usa una vez, no todos
 * los días, y arriba le sacaría lugar a lo que sí.
 */

import { useState } from 'react';
import { exportarComplejo } from '@/actions/panel';

export function LlevarseLosDatos({ complejoId, nombre }: { complejoId: string; nombre: string }) {
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function bajar() {
    setBajando(true);
    setError(null);
    try {
      const r = await exportarComplejo(complejoId);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }

      // Se arma el archivo en el navegador y se suelta. No pasa por ningún
      // servidor nuestro ni queda en ninguna parte: es del dueño y va derecho a
      // su máquina.
      const url = URL.createObjectURL(new Blob([r.json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos armar el archivo.');
    } finally {
      setBajando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <h3 className="font-semibold">Tus datos</h3>
      <p className="mt-1.5 text-sm opacity-70">
        Bajate todo lo de {nombre} en un archivo: tus unidades, tus precios, tus
        reglas y todas tus reservas con los datos de cada huésped. Son tuyos y te
        los podés llevar cuando quieras, sin pedírnoslo.
      </p>

      <button
        type="button"
        onClick={bajar}
        disabled={bajando}
        className="mt-3 rounded-xl bg-[#0d3b3e] px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
      >
        {bajando ? 'Armando el archivo…' : 'Bajar todo en un archivo'}
      </button>

      {error && <p className="mt-2 text-sm text-red-900">{error}</p>}
    </div>
  );
}
