'use client';

/**
 * Cerrar y reabrir fechas.
 *
 * ------------------------------------------------------------------
 * Por qué esto estaba faltando
 * ------------------------------------------------------------------
 * `desbloquear()` existía desde la primera semana y `bloquear()` no: el dueño
 * podía deshacer algo que no podía hacer. El motivo es que la función de
 * desbloqueo salió de auditar el `owner-unblock` del sistema anterior —el que
 * contestaba «listo, 1 fecha liberada» sin tocar nada durante siete meses— y
 * arreglar eso era lo urgente.
 *
 * Cerrar fechas es de lo que el dueño hace más seguido después de aprobar una
 * seña: la semana que viene la usa la familia, hay que pintar la cabaña tres,
 * el fin de semana largo lo tiene un conocido que llamó por teléfono. Hasta hoy
 * eso se hacía escribiéndonos.
 *
 * ------------------------------------------------------------------
 * Dos decisiones de pantalla
 * ------------------------------------------------------------------
 * **El formulario arranca cerrado.** Lo que el dueño mira acá casi siempre es
 * la lista —«¿qué tengo cerrado?»— y no el alta. Un formulario abierto arriba
 * empuja la lista fuera de la pantalla del celular.
 *
 * **Cuando choca, el error dice con qué.** No «no se pudo»: «del 12 al 15 lo
 * tiene Marcela». Es la diferencia entre un mensaje que lo manda a otra
 * pantalla a averiguar y uno con el que puede decidir ahí mismo.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cerrarFechas, reabrirFecha, type Resultado } from '@/actions/panel';
import type { Bloqueo, UnidadDelPanel } from '@/lib/panel';

export function Fechas({
  complejoId,
  unidades,
  bloqueos,
  hoy,
  zonaHoraria,
}: {
  complejoId: string;
  unidades: UnidadDelPanel[];
  bloqueos: Bloqueo[];
  /** El día de hoy EN LA ZONA DEL COMPLEJO, calculado en el servidor. */
  hoy: string;
  zonaHoraria: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Fechas cerradas</h3>
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="text-sm underline opacity-70"
        >
          {abierto ? 'Cancelar' : 'Cerrar fechas'}
        </button>
      </div>

      {abierto && (
        <Formulario
          complejoId={complejoId}
          unidades={unidades}
          hoy={hoy}
          onListo={() => setAbierto(false)}
        />
      )}

      {bloqueos.length === 0 ? (
        <p className="mt-3 text-sm opacity-60">
          No tenés ninguna fecha cerrada de acá en adelante.
        </p>
      ) : (
        <ul aria-label="Fechas cerradas" className="mt-3 space-y-2">
          {bloqueos.map((b) => (
            <Fila key={b.id} bloqueo={b} zonaHoraria={zonaHoraria} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Formulario({
  complejoId,
  unidades,
  hoy,
  onListo,
}: {
  complejoId: string;
  unidades: UnidadDelPanel[];
  hoy: string;
  onListo: () => void;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [unidadId, setUnidadId] = useState(unidades[0]?.id ?? '');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');

  const listo = !!unidadId && !!desde && !!hasta && desde < hasta;

  function enviar() {
    if (!listo) return;
    empezar(async () => {
      const r = await cerrarFechas(complejoId, unidadId, desde, hasta, motivo);
      setResultado(r);
      router.refresh();
      if (r.ok) {
        setDesde('');
        setHasta('');
        setMotivo('');
        onListo();
      }
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-black/[0.03] p-3">
      <label className="block text-sm">
        <span className="opacity-70">Unidad</span>
        <select
          value={unidadId}
          onChange={(e) => setUnidadId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
        >
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre} ({u.codigo})
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* `min={hoy}` es el día de hoy EN LA ZONA DEL COMPLEJO, calculado en el
            servidor. Si saliera del reloj del navegador, un dueño de viaje en
            España vería un mínimo corrido un día. */}
        <label className="block text-sm">
          <span className="opacity-70">Desde (primera noche)</span>
          <input
            type="date"
            value={desde}
            min={hoy}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
        <label className="block text-sm">
          <span className="opacity-70">Hasta (día de salida)</span>
          <input
            type="date"
            value={hasta}
            min={desde || hoy}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
      </div>

      {/* El día de salida no se cobra y no se ocupa: es el día de entrada del
          siguiente. Decirlo acá evita que el dueño cierre una noche de más
          todas las veces. */}
      <p className="text-xs opacity-60">
        La noche del día de salida queda libre: es el día en que puede entrar el
        próximo.
        {desde && hasta && desde < hasta && (
          <>
            {' '}
            Vas a cerrar <strong>{noches(desde, hasta)}</strong>{' '}
            {noches(desde, hasta) === 1 ? 'noche' : 'noches'}.
          </>
        )}
      </p>

      <label className="block text-sm">
        <span className="opacity-70">Por qué (lo ves sólo vos)</span>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="La usa la familia"
          className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
        />
      </label>

      {resultado && !resultado.ok && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">{resultado.mensaje}</p>
      )}

      <button
        type="button"
        disabled={!listo || enCurso}
        onClick={enviar}
        className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {enCurso ? 'Cerrando…' : 'Cerrar esas fechas'}
      </button>
    </div>
  );
}

function Fila({ bloqueo, zonaHoraria }: { bloqueo: Bloqueo; zonaHoraria: string }) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function reabrir() {
    empezar(async () => {
      const r = await reabrirFecha(bloqueo.id);
      setResultado(r);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">
            {dia(bloqueo.check_in, zonaHoraria)} → {dia(bloqueo.check_out, zonaHoraria)}
          </span>
          <span className="ml-2 opacity-60">
            {bloqueo.unidad_nombre} · {bloqueo.noches}{' '}
            {bloqueo.noches === 1 ? 'noche' : 'noches'}
          </span>
        </div>
        <button
          type="button"
          onClick={reabrir}
          disabled={enCurso}
          className="rounded-lg border border-black/15 px-3 py-1 text-xs disabled:opacity-40"
        >
          {enCurso ? 'Reabriendo…' : 'Reabrir'}
        </button>
      </div>

      {bloqueo.motivo && <p className="mt-0.5 text-xs opacity-60">{bloqueo.motivo}</p>}

      {resultado && (
        <p
          className={`mt-1 rounded-lg px-2 py-1 text-xs ${
            resultado.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {resultado.mensaje}
        </p>
      )}
    </li>
  );
}

/**
 * Las noches entre dos días.
 *
 * Con `Date.UTC` y no con `new Date(iso)`: la segunda interpreta la cadena como
 * medianoche UTC y, al restar, el horario de verano de alguna de las dos puntas
 * puede dejar 3,96 días en vez de 4. Acá los dos extremos son mediodía UTC, que
 * es un punto que ningún cambio de hora mueve.
 */
function noches(desde: string, hasta: string): number {
  const [ad, md, dd] = desde.split('-').map(Number);
  const [ah, mh, dh] = hasta.split('-').map(Number);
  const a = Date.UTC(ad, md - 1, dd, 12);
  const b = Date.UTC(ah, mh - 1, dh, 12);
  return Math.round((b - a) / 86_400_000);
}

/** Un día, en la zona del complejo. El `T12:00` evita que se corra uno. */
function dia(iso: string, zona: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: zona,
    day: '2-digit',
    month: '2-digit',
  });
}
