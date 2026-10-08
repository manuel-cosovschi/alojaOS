'use client';

/**
 * Las señas que esperan que el dueño las revise.
 *
 * El orden de la información es el orden en que el dueño decide: cuánto, de
 * quién, para cuándo, **si llegó el comprobante**, y cuánto falta para que
 * venza. Lo último primero en lo visual, porque es lo que lo apura.
 *
 * Y una cosa que no es obvia: si NO hay comprobante, el botón de confirmar está
 * igual. No se bloquea. El dueño puede haber visto la transferencia en su
 * homebanking, o el huésped puede habérsela mandado por WhatsApp. Un sistema que
 * le prohíbe confirmar lo que él sabe que pasó es un sistema que lo obliga a
 * trabajar por afuera, y entonces el sistema deja de ser la verdad.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { aprobar, rechazar, enlaceAlComprobante, type Resultado } from '@/actions/panel';
import type { SenaPendiente } from '@/lib/panel';

const plata = (n: string | null, moneda: string) =>
  n === null
    ? '—'
    : new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: moneda,
        maximumFractionDigits: 0,
      }).format(Number(n));

export function Senas({
  senas,
  moneda,
  zonaHoraria,
}: {
  senas: SenaPendiente[];
  moneda: string;
  zonaHoraria: string;
}) {
  if (senas.length === 0) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white/60 p-6 text-sm opacity-70">
        No hay señas esperando. Cuando alguien reserve por la página, aparece acá.
      </div>
    );
  }

  return (
    // Con nombre: hay dos listas en esta pantalla —las señas y los huéspedes a
    // los que no les llegó el mail— y las dos tienen nombres de personas
    // adentro. Para quien usa un lector de pantalla eso es la diferencia entre
    // dos listas y una sopa, y para las pruebas es la diferencia entre apuntar
    // a la fila correcta y apuntar a la primera que coincida.
    <ul aria-label="Señas que esperan revisión" className="space-y-3">
      {senas.map((s) => (
        <Sena key={s.id} sena={s} moneda={moneda} zonaHoraria={zonaHoraria} />
      ))}
    </ul>
  );
}

function Sena({
  sena,
  moneda,
  zonaHoraria,
}: {
  sena: SenaPendiente;
  moneda: string;
  zonaHoraria: string;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  const vencida = sena.vence_el !== null && new Date(sena.vence_el) < new Date();

  function hacer(accion: () => Promise<Resultado>) {
    empezar(async () => {
      const r = await accion();
      setResultado(r);
      // Se refresca igual si falló: el motivo del fallo suele ser que la
      // reserva cambió de estado, y entonces la lista que se está mirando ya
      // no es la de la base.
      router.refresh();
    });
  }

  async function verComprobante() {
    setAbriendo(true);
    try {
      const url = await enlaceAlComprobante(sena.id);
      if (url) window.open(url, '_blank', 'noopener');
      else setResultado({ ok: false, mensaje: 'No pudimos abrir el comprobante.' });
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <li className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold">{sena.huesped_nombre ?? 'Sin nombre'}</span>
          <span className="ml-2 text-sm opacity-60">{sena.unidad_codigo}</span>
        </div>
        <div className="text-sm">
          Seña: <strong>{plata(sena.importe, moneda)}</strong>
          <span className="opacity-50"> del total</span>
        </div>
      </div>

      <div className="mt-1 text-sm opacity-70">
        {fecha(sena.check_in, zonaHoraria)} → {fecha(sena.check_out, zonaHoraria)}
        {sena.personas ? ` · ${sena.personas} personas` : ''}
      </div>

      {/* Cómo contactarlo. Si el dueño va a llamar a alguien para pedirle el
          comprobante, el teléfono tiene que estar acá y no en otra pantalla. */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {sena.huesped_telefono && (
          <a className="underline" href={`https://wa.me/${sena.huesped_telefono}`} target="_blank" rel="noopener">
            WhatsApp
          </a>
        )}
        {sena.huesped_telefono && <span className="opacity-60">{sena.huesped_telefono}</span>}
        {sena.huesped_email && <span className="opacity-60">{sena.huesped_email}</span>}
      </div>

      {/* El vencimiento. Un hold atrasado se marca distinto: significa que el
          mecanismo no lo venció cuando correspondía, y el dueño tiene que saber
          que lo que está mirando ya no debería estar en la lista. */}
      <p className={`mt-2 text-sm ${vencida ? 'font-semibold text-red-700' : 'opacity-70'}`}>
        {vencida
          ? `Venció el ${fechaYHora(sena.vence_el, zonaHoraria)} y todavía figura ocupando las noches.`
          : `Vence el ${fechaYHora(sena.vence_el, zonaHoraria)}.`}
      </p>

      {/* El comprobante */}
      <div className="mt-3 rounded-xl bg-black/[0.03] px-3 py-2 text-sm">
        {sena.comprobante_subido_el ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Comprobante subido el <strong>{fechaYHora(sena.comprobante_subido_el, zonaHoraria)}</strong>
            </span>
            <button
              type="button"
              onClick={verComprobante}
              disabled={abriendo}
              className="rounded-xl bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {abriendo ? 'Abriendo…' : 'Ver'}
            </button>
          </div>
        ) : (
          <span className="opacity-70">
            Sin comprobante. Podés confirmarla igual si viste la transferencia.
          </span>
        )}
      </div>

      {resultado && (
        <p
          className={`mt-2 rounded-xl px-3 py-2 text-sm ${
            resultado.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {resultado.mensaje}
        </p>
      )}

      {rechazando ? (
        <div className="mt-3 space-y-2">
          <label className="block text-sm">
            <span className="opacity-70">Por qué la rechazás (lo ves sólo vos)</span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="No llegó la transferencia"
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-black/40"
            />
          </label>
          <p className="text-xs opacity-60">
            Las noches quedan libres al instante. Al huésped no le llega este
            texto: avisale vos por WhatsApp.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={enCurso}
              onClick={() => hacer(() => rechazar(sena.id, motivo))}
              className="rounded-2xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {enCurso ? 'Rechazando…' : 'Rechazar y liberar las noches'}
            </button>
            <button
              type="button"
              onClick={() => setRechazando(false)}
              className="rounded-2xl px-4 py-2 text-sm underline opacity-70"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={enCurso}
            onClick={() => hacer(() => aprobar(sena.id))}
            className="rounded-2xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {enCurso ? 'Confirmando…' : 'Confirmar la reserva'}
          </button>
          <button
            type="button"
            onClick={() => setRechazando(true)}
            className="rounded-2xl border border-black/15 px-4 py-2 text-sm"
          >
            Rechazar
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Las fechas se muestran en la zona del complejo, no en la del teléfono.
 *
 * Un check-in es un día de Argentina. Si el dueño está de viaje en España y la
 * pantalla le corre las fechas un día, el panel le está mintiendo sobre cuándo
 * llega un huésped. El `T12:00` es para que el día no se corra al convertir: un
 * `DATE` no tiene hora, y tomarlo como medianoche UTC lo retrasa un día en
 * cualquier zona al oeste de Greenwich.
 */
function fecha(iso: string, zona: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: zona,
    day: '2-digit',
    month: '2-digit',
  });
}

function fechaYHora(iso: string | null, zona: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: zona,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // Reloj de 24 horas, que es como se mira una hora en Argentina. Y además
    // `es-AR` en 12 horas escribe «03:59 p. m.», con punto final, así que la
    // oración quedaba «Vence el 8/10, 03:59 p. m..» con dos puntos.
    hour12: false,
  });
}
