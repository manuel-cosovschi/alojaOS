'use client';

/**
 * La pantalla de "ya reservaste, ahora transferí".
 *
 * Lo que tiene que lograr, en orden: que la persona sepa cuánto transferir y a
 * dónde, que pueda subir la foto desde el celular, y que **vea que el sistema la
 * tiene**.
 *
 * Lo último no es un detalle de cortesía. En el sistema anterior la subida
 * contestaba "ok" sin guardar nada, durante meses, y nadie se enteró porque la
 * única forma de notarlo era que el dueño fuera a buscar un comprobante. Acá el
 * estado se lee de la base después de subir: si dice que no está, la persona lo
 * ve en su pantalla y puede volver a intentar o escribir por WhatsApp.
 */

import { useRef, useState } from 'react';
import { subirComprobante, estadoDeLaSena, type ResultadoComprobante } from '@/actions/comprobante';

interface Props {
  reservaId: string;
  moneda: string;
  sena: number;
  total: number;
  venceEl: string;
  zonaHoraria: string;
  noches: number;
  datosTransferencia: string | null;
  whatsapp: string | null;
  /** Si el sistema ya tiene un comprobante para esta reserva. */
  yaTieneComprobante?: boolean;
}

const plata = (n: number, moneda: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(n);

export function Comprobante({
  reservaId,
  moneda,
  sena,
  total,
  venceEl,
  zonaHoraria,
  noches,
  datosTransferencia,
  whatsapp,
  yaTieneComprobante = false,
}: Props) {
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoComprobante | null>(null);
  // Lo que dice la BASE, no lo que dijo la subida. Es la diferencia entre
  // "contestó ok" y "está guardado".
  const [confirmadoPorLaBase, setConfirmadoPorLaBase] = useState(yaTieneComprobante);
  const input = useRef<HTMLInputElement>(null);

  const vence = new Date(venceEl).toLocaleString('es-AR', {
    timeZone: zonaHoraria,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    setResultado(null);
    try {
      const r = await subirComprobante(reservaId, archivo);
      setResultado(r);

      if (r.ok) {
        // No se da por guardado porque la subida dijo que sí: se vuelve a
        // preguntar a la base. Si contestara que no, la pantalla lo diría.
        const estado = await estadoDeLaSena(reservaId);
        setConfirmadoPorLaBase(estado.comprobante);
      }
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="font-semibold text-emerald-900">Te guardamos la unidad</h2>
        <p className="mt-2 text-sm text-emerald-900">
          {noches} {noches === 1 ? 'noche' : 'noches'} · Seña a transferir:{' '}
          <strong>{plata(sena, moneda)}</strong> de {plata(total, moneda)}.
        </p>
        <p className="mt-2 text-sm text-emerald-900">
          Vence el <strong>{vence}</strong>. Si no llega la transferencia antes de
          esa hora, las fechas se liberan solas.
        </p>
      </div>

      {/* Dónde transferir */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Dónde transferir
        </h3>
        {datosTransferencia ? (
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{datosTransferencia}</pre>
        ) : (
          <p className="mt-2 text-sm">
            El complejo todavía no publicó sus datos bancarios.
            {whatsapp && (
              <>
                {' '}Escribinos por{' '}
                <a className="underline" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener">
                  WhatsApp
                </a>{' '}
                y te los pasamos.
              </>
            )}
          </p>
        )}
      </div>

      {/* El comprobante */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          El comprobante
        </h3>

        {confirmadoPorLaBase ? (
          <div className="mt-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-medium">Lo tenemos.</p>
            <p className="mt-1">
              El dueño lo va a revisar y te confirma la reserva. Si querés cambiar
              la foto, podés subir otra.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm opacity-80">
            Subí la foto o el PDF de la transferencia. Hasta 8 MB.
          </p>
        )}

        {resultado && !resultado.ok && (
          <p className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
            {resultado.mensaje}
            {whatsapp && (
              <>
                {' '}También podés mandárnoslo por{' '}
                <a className="underline" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener">
                  WhatsApp
                </a>
                .
              </>
            )}
          </p>
        )}

        {/* El caso que el sistema anterior no contemplaba: la subida dijo que
            salió bien y la base no lo tiene. Pasó durante meses. */}
        {resultado?.ok && !confirmadoPorLaBase && (
          <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            El archivo se subió pero todavía no lo vemos registrado. Probá de
            nuevo en un minuto
            {whatsapp && (
              <>
                {' '}o mandanoslo por{' '}
                <a className="underline" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener">
                  WhatsApp
                </a>
              </>
            )}
            .
          </p>
        )}

        <label className="mt-4 inline-block">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            disabled={subiendo}
            onChange={(ev) => elegir(ev.target.files?.[0])}
            className="sr-only"
            aria-label="Elegir el comprobante"
          />
          <span
            role="button"
            tabIndex={0}
            aria-disabled={subiendo}
            className="inline-block cursor-pointer rounded-2xl bg-marca-principal px-6 py-3 font-semibold text-white transition aria-disabled:opacity-40"
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') input.current?.click();
            }}
          >
            {subiendo
              ? 'Subiendo…'
              : confirmadoPorLaBase
                ? 'Subir otra foto'
                : 'Subir el comprobante'}
          </span>
        </label>

        <p className="mt-3 text-xs opacity-60">Número de reserva: {reservaId}</p>
      </div>
    </div>
  );
}
