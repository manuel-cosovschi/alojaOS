'use client';

/**
 * Los precios, cargados por el dueño.
 *
 * ------------------------------------------------------------------
 * Por qué esta pantalla es la que faltaba más
 * ------------------------------------------------------------------
 * Hasta hoy los precios los cargo yo con un INSERT. Eso alcanza para el primer
 * cliente y no para cinco: el precio de la temporada que viene lo decide el
 * dueño en diciembre, muchas veces un domingo, y si para cambiarlo tiene que
 * escribirnos, no lo cambia. Queda vendiendo enero a precio de octubre.
 *
 * ------------------------------------------------------------------
 * Lo primero que se ve es lo que está roto
 * ------------------------------------------------------------------
 * Arriba de la lista va el aviso de qué no se puede cotizar, porque las dos
 * fallas de esta parte del sistema son invisibles desde adentro:
 *
 * **Una unidad sin precio en un período queda invendible.** El calendario la
 * muestra libre, el huésped elige las fechas, y recién al pedir el precio
 * aparece que no hay. Nadie se entera: el que no pudo reservar se va, no
 * escribe.
 *
 * **`ultima_fecha` se pasa sola.** El día que pasa, el calendario deja de
 * ofrecer absolutamente todo. El sistema sigue andando, la página carga, y no
 * se puede reservar nada. Eso le va a pasar a cada cliente todos los años.
 *
 * ------------------------------------------------------------------
 * Una tabla y no un formulario por unidad
 * ------------------------------------------------------------------
 * El dueño piensa «enero sale tanto», y ese «tanto» son cinco números que
 * decide juntos y comparando entre sí. Una pantalla por unidad lo obliga a
 * recordar lo que puso en la anterior.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { guardarPeriodo, borrarPeriodo, type Resultado } from '@/actions/panel';
import type {
  PeriodoDePrecio,
  SaludDeLosPrecios,
  UnidadDelPanel,
  UnidadSinPrecio,
} from '@/lib/panel';

export function Precios({
  complejoId,
  unidades,
  periodos,
  salud,
  moneda,
  hoy,
}: {
  complejoId: string;
  unidades: UnidadDelPanel[];
  periodos: PeriodoDePrecio[];
  salud: SaludDeLosPrecios | null;
  moneda: string;
  /** El día de hoy EN LA ZONA DEL COMPLEJO, calculado en el servidor. */
  hoy: string;
}) {
  // `null` = cerrado, `'nuevo'` = alta, un id = editando ese período.
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Precios por período</h3>
        <button
          type="button"
          onClick={() => setEditando((e) => (e === 'nuevo' ? null : 'nuevo'))}
          className="text-sm underline opacity-70"
        >
          {editando === 'nuevo' ? 'Cancelar' : 'Agregar un período'}
        </button>
      </div>

      <SaludDePrecios salud={salud} />

      {editando === 'nuevo' && (
        <Formulario
          complejoId={complejoId}
          unidades={unidades}
          hoy={hoy}
          periodo={null}
          onListo={() => setEditando(null)}
        />
      )}

      {periodos.length === 0 ? (
        <p className="mt-3 text-sm opacity-60">
          Todavía no cargaste ningún período. Sin precio no se puede reservar
          ninguna noche.
        </p>
      ) : (
        <ul aria-label="Períodos de precio" className="mt-3 space-y-2">
          {periodos.map((p) => (
            <Fila
              key={p.id}
              complejoId={complejoId}
              unidades={unidades}
              periodo={p}
              moneda={moneda}
              hoy={hoy}
              editando={editando === p.id}
              onEditar={() => setEditando((e) => (e === p.id ? null : p.id))}
              onListo={() => setEditando(null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Qué no se puede cotizar.
 *
 * Tres estados y ninguno es «todo bien» por omisión:
 *
 * - `salud === null` es que la consulta falló. Se dice, porque «no pude
 *   comprobarlo» no es «está bien» —es la clase de confusión que este sistema
 *   existe para no tener—.
 * - Hay algo roto: se enumera, con la unidad y desde cuándo.
 * - Está todo cotizable: una línea sola, con hasta cuándo llega la ventana.
 */
function SaludDePrecios({ salud }: { salud: SaludDeLosPrecios | null }) {
  if (salud === null) {
    return (
      <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
        No pudimos comprobar si hay noches sin precio. Eso no quiere decir que
        esté todo bien: quiere decir que no sabemos.
      </div>
    );
  }

  if (salud.sin_config) {
    return (
      <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">
        <strong>La página no ofrece ninguna fecha.</strong> {salud.mensaje}
      </div>
    );
  }

  if (salud.esta_bien) {
    return (
      <p className="mt-3 text-sm text-emerald-800">
        Todas las noches reservables tienen precio, hasta el{' '}
        {dia(salud.ventana_hasta)}
        {salud.dias_hasta_el_cierre <= 60 && (
          <>
            {' '}
            — faltan {salud.dias_hasta_el_cierre} días para esa fecha, después
            la página deja de ofrecer noches hasta que la corras.
          </>
        )}
        .
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">
      {salud.ventana_vencida && (
        <p>
          <strong>Nadie puede reservar nada.</strong> La última fecha reservable
          era el {dia(salud.ventana_hasta)} y ya pasó. El calendario de tu página
          está vacío hasta que la corras.
        </p>
      )}

      {salud.unidades === 0 && (
        <p>
          <strong>No tenés unidades cargadas</strong>, así que no hay nada que
          vender.
        </p>
      )}

      {salud.noches_sin_periodo > 0 && (
        <p>
          <strong>
            {salud.noches_sin_periodo}{' '}
            {salud.noches_sin_periodo === 1 ? 'noche' : 'noches'} sin precio
          </strong>{' '}
          {salud.primera_noche_sin_periodo && (
            <>desde el {dia(salud.primera_noche_sin_periodo)}. </>
          )}
          Nadie puede reservar esas noches en ninguna unidad.
        </p>
      )}

      {salud.unidades_sin_precio.length > 0 && (
        <div>
          <p className="font-semibold">
            {salud.unidades_sin_precio.length === 1
              ? 'Una unidad no se puede reservar:'
              : `${salud.unidades_sin_precio.length} unidades no se pueden reservar:`}
          </p>
          <ul aria-label="Unidades sin precio" className="mt-1 space-y-0.5">
            {salud.unidades_sin_precio.map((u: UnidadSinPrecio) => (
              <li key={u.unidad_id}>
                · <strong>{u.nombre}</strong>, {u.noches}{' '}
                {u.noches === 1 ? 'noche' : 'noches'} desde el {dia(u.desde)}:
                no tiene precio cargado.
              </li>
            ))}
          </ul>
          {/* El calendario no distingue «sin precio» de «libre», así que esto
              no se ve desde la página del huésped. Decirlo evita que el dueño
              piense que ya lo habría notado. */}
          <p className="mt-1 opacity-80">
            El calendario las muestra libres igual: el huésped elige las fechas y
            recién ahí no hay precio.
          </p>
        </div>
      )}
    </div>
  );
}

function Fila({
  complejoId,
  unidades,
  periodo,
  moneda,
  hoy,
  editando,
  onEditar,
  onListo,
}: {
  complejoId: string;
  unidades: UnidadDelPanel[];
  periodo: PeriodoDePrecio;
  moneda: string;
  hoy: string;
  editando: boolean;
  onEditar: () => void;
  onListo: () => void;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function borrar() {
    empezar(async () => {
      const r = await borrarPeriodo(periodo.id);
      setResultado(r);
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">
            {dia(periodo.desde)} → {dia(periodo.hasta)}
          </span>
          <span className="ml-2 opacity-60">
            {periodo.noches} {periodo.noches === 1 ? 'noche' : 'noches'}
            {periodo.etiqueta && ` · ${periodo.etiqueta}`}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEditar}
            className="rounded-lg border border-black/15 px-3 py-1 text-xs"
          >
            {editando ? 'Cerrar' : 'Editar'}
          </button>
          {confirmando ? (
            <>
              <button
                type="button"
                onClick={borrar}
                disabled={enCurso}
                className="rounded-lg bg-red-700 px-3 py-1 text-xs text-white disabled:opacity-40"
              >
                {enCurso ? 'Borrando…' : 'Borrar en serio'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="text-xs underline opacity-70"
              >
                No
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="rounded-lg border border-black/15 px-3 py-1 text-xs"
            >
              Borrar
            </button>
          )}
        </div>
      </div>

      {/* Los precios de todas las unidades juntos: es la comparación que el
          dueño hace cuando mira esto. Las que no tienen precio se marcan, no
          se omiten. */}
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {periodo.precios.map((p) => (
          <span
            key={p.unidad_id}
            className={!p.activa ? 'opacity-40' : p.precio === null ? 'text-red-700' : 'opacity-70'}
          >
            {p.codigo}:{' '}
            {p.precio === null ? (
              // Sin precio es rojo sólo si la unidad se vende. Una unidad fuera
              // de circulación sin precio no es un problema: no se publica ni
              // se puede reservar, por otro motivo.
              p.activa ? <strong>sin precio</strong> : 'sin precio'
            ) : (
              plata(Number(p.precio), moneda)
            )}
            {!p.activa && <span className="ml-1">(fuera de circulación)</span>}
          </span>
        ))}
      </div>

      {resultado && (
        <p
          className={`mt-1 rounded-lg px-2 py-1 text-xs ${
            resultado.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {resultado.mensaje}
        </p>
      )}

      {editando && (
        <Formulario
          complejoId={complejoId}
          unidades={unidades}
          hoy={hoy}
          periodo={periodo}
          onListo={onListo}
        />
      )}
    </li>
  );
}

function Formulario({
  complejoId,
  unidades,
  hoy,
  periodo,
  onListo,
}: {
  complejoId: string;
  unidades: UnidadDelPanel[];
  hoy: string;
  /** null = alta. */
  periodo: PeriodoDePrecio | null;
  onListo: () => void;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [desde, setDesde] = useState(periodo?.desde ?? '');
  const [hasta, setHasta] = useState(periodo?.hasta ?? '');
  const [etiqueta, setEtiqueta] = useState(periodo?.etiqueta ?? '');
  const [precios, setPrecios] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      unidades.map((u) => [
        u.id,
        // Se muestra sin decimales si es un entero: los precios reales son
        // «150000», y «150000.00» le hace contar ceros al que lo lee.
        aTexto(periodo?.precios.find((p) => p.unidad_id === u.id)?.precio ?? null),
      ])
    )
  );

  const listo = !!desde && !!hasta && desde <= hasta;
  // Sólo las activas: avisar de una unidad que el dueño sacó de circulación a
  // propósito sería una alarma falsa, y las alarmas falsas enseñan a ignorar
  // las alarmas.
  const sinPrecio = unidades.filter((u) => u.activa && !precios[u.id]?.trim());

  function enviar() {
    if (!listo) return;
    empezar(async () => {
      const r = await guardarPeriodo(complejoId, desde, hasta, precios, etiqueta, periodo?.id ?? null);
      setResultado(r);
      router.refresh();
      if (r.ok) onListo();
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-black/[0.03] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Sin `min`: un período que ya empezó se puede seguir editando, y un
            dueño que carga la temporada en enero necesita tocar el tramo en
            curso. La ventana de lo reservable la pone `config_calendario`, no
            este formulario. */}
        <label className="block text-sm">
          <span className="opacity-70">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
        <label className="block text-sm">
          <span className="opacity-70">Hasta (última noche, inclusive)</span>
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
      </div>

      {/* `hasta` es INCLUSIVO acá y en la base, al revés que en las reservas,
          donde el día de salida no se cobra. Son dos cosas distintas y los dos
          formularios lo dicen, porque es el error que se comete una vez por
          temporada si no está escrito. */}
      <p className="text-xs opacity-60">
        La noche del día «hasta» se cobra a este precio.
        {desde && hasta && desde <= hasta && (
          <>
            {' '}
            Son <strong>{noches(desde, hasta)}</strong>{' '}
            {noches(desde, hasta) === 1 ? 'noche' : 'noches'}.
          </>
        )}
        {desde && desde < hoy && (
          <> Este tramo arranca antes de hoy, así que parte ya pasó.</>
        )}
      </p>

      <label className="block text-sm">
        <span className="opacity-70">Cómo le decís (lo ves sólo vos)</span>
        <input
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          placeholder="Temporada alta"
          className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
        />
      </label>

      <div>
        <p className="text-sm opacity-70">Precio por noche, por unidad</p>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {unidades.map((u) => (
            // Las inactivas se muestran igual, porque los precios se reemplazan
            // enteros: si el campo no estuviera, guardar le borraría el precio y
            // el día que el dueño la reactive quedaría invendible en silencio.
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <span
                className={`w-28 shrink-0 truncate ${u.activa ? 'opacity-70' : 'opacity-40'}`}
                title={u.activa ? u.nombre : `${u.nombre} — fuera de circulación`}
              >
                {u.nombre}
                {!u.activa && ' · fuera'}
              </span>
              <input
                inputMode="decimal"
                value={precios[u.id] ?? ''}
                onChange={(e) =>
                  setPrecios((p) => ({ ...p, [u.id]: e.target.value }))
                }
                placeholder="sin precio"
                className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Dejar una unidad sin precio está permitido —puede ser a propósito—
          pero no puede ser a propósito sin que el dueño lo sepa. Así que se
          dice antes de guardar, con el nombre de la unidad y la consecuencia. */}
      {sinPrecio.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Si lo guardás así,{' '}
          <strong>
            {sinPrecio.map((u) => u.nombre).join(', ')}
          </strong>{' '}
          {sinPrecio.length === 1 ? 'no se va a poder reservar' : 'no se van a poder reservar'}{' '}
          en este tramo. Se puede, pero nadie más te lo va a avisar.
        </p>
      )}

      {resultado && !resultado.ok && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">{resultado.mensaje}</p>
      )}

      <button
        type="button"
        disabled={!listo || enCurso}
        onClick={enviar}
        className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {enCurso ? 'Guardando…' : periodo ? 'Guardar los cambios' : 'Cargar el período'}
      </button>
    </div>
  );
}

/** `150000.00` → `150000`; `1234.50` → `1234,5`. Null → vacío. */
function aTexto(precio: string | null): string {
  if (precio === null) return '';
  const n = Number(precio);
  if (!Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}

function plata(n: number, moneda: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Las noches de un período.
 *
 * `hasta` es inclusivo acá, así que son los días entre las dos puntas MÁS UNO.
 * Y con `Date.UTC(…, 12)` por el mismo motivo que en las fechas cerradas: a
 * medianoche, un cambio de hora en una de las dos puntas deja 30,96 días.
 */
function noches(desde: string, hasta: string): number {
  const [ad, md, dd] = desde.split('-').map(Number);
  const [ah, mh, dh] = hasta.split('-').map(Number);
  const a = Date.UTC(ad, md - 1, dd, 12);
  const b = Date.UTC(ah, mh - 1, dh, 12);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Un día, corto. El `T12:00` evita que se corra uno. */
function dia(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
