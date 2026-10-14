'use client';

/**
 * Las reglas de la temporada, desde el panel.
 *
 * ------------------------------------------------------------------
 * La única falla de este sistema que llega sola
 * ------------------------------------------------------------------
 * Todo lo demás que puede andar mal necesita que alguien haga algo: cargar un
 * precio de menos, cerrar una fecha vendida, rechazar una seña que no era.
 * `ultima_fecha` no: es una fecha, y las fechas pasan. El día que pasa, el
 * calendario de la página deja de ofrecer absolutamente todo. El sistema sigue
 * respondiendo, la página carga, y no se puede reservar nada.
 *
 * Le va a pasar a cada cliente todos los años. Hasta hoy la única forma de
 * arreglarlo era que me escribiera, y el que no se dio cuenta no escribió.
 *
 * Por eso lo primero de esta pantalla es cuántos días faltan, en grande, con el
 * color que corresponda. No es un dato de configuración: es un cronómetro.
 *
 * ------------------------------------------------------------------
 * Dos conceptos de fecha en la misma pantalla
 * ------------------------------------------------------------------
 * En los mínimos por tramo, `hasta` es la última NOCHE. En los bloques fijos,
 * `check_out` es el día de SALIDA, que no se cobra. Son dos cosas distintas
 * porque un bloque se compara contra una estadía y una estadía tiene día de
 * salida, mientras que un tramo describe noches.
 *
 * No lo unifiqué: unificarlo haría que uno de los dos mienta. Los dos
 * formularios lo dicen con palabras, porque es la clase de diferencia que se
 * olvida una vez por temporada.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  guardarVentana,
  guardarMinimo,
  borrarMinimo,
  guardarBloqueFijo,
  borrarBloqueFijo,
  type Resultado,
} from '@/actions/panel';
import type { BloqueDelPanel, MinimoDelPanel, ReglasDelCalendario } from '@/lib/panel';

const NOMBRE_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** A cuántos días del cierre se empieza a avisar. */
const AVISAR_DESDE = 60;

export function ReglasDeTemporada({
  complejoId,
  reglas,
}: {
  complejoId: string;
  reglas: ReglasDelCalendario | null;
}) {
  if (reglas === null) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
        <h3 className="font-semibold">Reglas de la temporada</h3>
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No pudimos leerlas. Eso no quiere decir que estén bien: quiere decir
          que no sabemos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Ventana complejoId={complejoId} reglas={reglas} />
      <Minimos complejoId={complejoId} reglas={reglas} />
      <Bloques complejoId={complejoId} reglas={reglas} />
    </div>
  );
}

/** Hasta cuándo se vende, desde cuándo, y el mínimo general. */
function Ventana({
  complejoId,
  reglas,
}: {
  complejoId: string;
  reglas: ReglasDelCalendario;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ultima, setUltima] = useState(reglas.config?.ultima_fecha ?? '');
  const [primera, setPrimera] = useState(reglas.config?.primera_fecha ?? '');
  const [minimo, setMinimo] = useState(String(reglas.config?.minimo_noches ?? 1));

  const faltan = reglas.config ? dias(reglas.hoy, reglas.config.ultima_fecha) : null;
  const n = Number(minimo);
  const listo = !!ultima && Number.isInteger(n) && n >= 1 && n <= 30;

  function enviar() {
    if (!listo) return;
    empezar(async () => {
      const r = await guardarVentana(complejoId, ultima, n, primera || null);
      setResultado(r);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <h3 className="font-semibold">Hasta cuándo se puede reservar</h3>

      <Cronometro config={reglas.config} faltan={faltan} />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="opacity-70">Última noche reservable</span>
          <input
            type="date"
            value={ultima}
            onChange={(e) => setUltima(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
        <label className="block text-sm">
          <span className="opacity-70">Primera (opcional)</span>
          <input
            type="date"
            value={primera}
            onChange={(e) => setPrimera(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
        <label className="block text-sm">
          <span className="opacity-70">Mínimo de noches</span>
          <input
            type="number"
            min={1}
            max={30}
            value={minimo}
            onChange={(e) => setMinimo(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
      </div>

      {/* Dejar la primera fecha vacía NO es lo mismo que ponerle hoy: vacía
          significa «desde hoy, siempre», y una fecha fija queda vieja al día
          siguiente de pasar. Decirlo evita que el dueño la cargue todos los
          años sin necesidad. */}
      <p className="mt-2 text-xs opacity-60">
        Dejá la primera vacía si vendés de hoy en adelante: así no hay que
        tocarla nunca más. Ponele una fecha sólo si la temporada abre un día
        concreto.
      </p>

      {resultado && (
        <p
          className={`mt-2 rounded-xl px-3 py-2 text-sm ${
            resultado.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {resultado.mensaje}
        </p>
      )}

      <button
        type="button"
        disabled={!listo || enCurso}
        onClick={enviar}
        className="mt-3 rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {enCurso ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

/**
 * Cuántos días faltan para que la página deje de vender.
 *
 * Tres estados, y el del medio es el que justifica que esto exista: cuando
 * faltan menos de dos meses nada está roto todavía, y es el único momento en
 * que avisar sirve de algo.
 */
function Cronometro({
  config,
  faltan,
}: {
  config: ReglasDelCalendario['config'];
  faltan: number | null;
}) {
  if (!config || faltan === null) {
    return (
      <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">
        <strong>No cargaste hasta cuándo se puede reservar.</strong> Mientras
        falte, tu página no ofrece ninguna fecha: el calendario sale vacío.
      </p>
    );
  }

  if (faltan < 0) {
    return (
      <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">
        <strong>Nadie puede reservar nada.</strong> La última noche reservable
        era el {dia(config.ultima_fecha)}, hace {-faltan}{' '}
        {-faltan === 1 ? 'día' : 'días'}. Corré la fecha y vuelve a andar.
      </p>
    );
  }

  if (faltan <= AVISAR_DESDE) {
    return (
      <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Se puede reservar hasta el <strong>{dia(config.ultima_fecha)}</strong>,
        o sea <strong>{faltan} {faltan === 1 ? 'día' : 'días'}</strong> más. Si
        tu temporada sigue después de esa fecha, corréla ahora: el día que pase,
        la página deja de ofrecer todo.
      </p>
    );
  }

  return (
    <p className="mt-2 text-sm opacity-70">
      Se puede reservar hasta el <strong>{dia(config.ultima_fecha)}</strong>
      {config.primera_fecha && <> y desde el {dia(config.primera_fecha)}</>}, con
      un mínimo de {config.minimo_noches}{' '}
      {config.minimo_noches === 1 ? 'noche' : 'noches'}.
    </p>
  );
}

/** Los mínimos por tramo: la ex-constante de temporada alta. */
function Minimos({
  complejoId,
  reglas,
}: {
  complejoId: string;
  reglas: ReglasDelCalendario;
}) {
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Mínimos por tramo</h3>
        <button
          type="button"
          onClick={() => setEditando((e) => (e === 'nuevo' ? null : 'nuevo'))}
          className="text-sm underline opacity-70"
        >
          {editando === 'nuevo' ? 'Cancelar' : 'Agregar un tramo'}
        </button>
      </div>

      <p className="mt-1 text-xs opacity-60">
        Pisa al mínimo general mientras dura. Sirve para «en enero, siete noches,
        y se entra sábado o domingo».
      </p>

      {editando === 'nuevo' && (
        <FormularioMinimo
          complejoId={complejoId}
          minimo={null}
          onListo={() => setEditando(null)}
        />
      )}

      {reglas.minimos.length === 0 ? (
        <p className="mt-3 text-sm opacity-60">
          No tenés tramos cargados: en todas las fechas rige el mínimo general.
        </p>
      ) : (
        <ul aria-label="Mínimos por tramo" className="mt-3 space-y-2">
          {reglas.minimos.map((m) => (
            <FilaMinimo
              key={m.id}
              complejoId={complejoId}
              minimo={m}
              editando={editando === m.id}
              onEditar={() => setEditando((e) => (e === m.id ? null : m.id))}
              onListo={() => setEditando(null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaMinimo({
  complejoId,
  minimo,
  editando,
  onEditar,
  onListo,
}: {
  complejoId: string;
  minimo: MinimoDelPanel;
  editando: boolean;
  onEditar: () => void;
  onListo: () => void;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function borrar() {
    empezar(async () => {
      const r = await borrarMinimo(minimo.id);
      setResultado(r);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">
            {dia(minimo.desde)} → {dia(minimo.hasta)}
          </span>
          <span className="ml-2 opacity-60">
            {minimo.noches} {minimo.noches === 1 ? 'noche' : 'noches'} mínimo
            {minimo.etiqueta && ` · ${minimo.etiqueta}`}
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
          <button
            type="button"
            onClick={borrar}
            disabled={enCurso}
            className="rounded-lg border border-black/15 px-3 py-1 text-xs disabled:opacity-40"
          >
            {enCurso ? 'Borrando…' : 'Borrar'}
          </button>
        </div>
      </div>

      <p className="mt-0.5 text-xs opacity-60">
        {minimo.dias_checkin === null
          ? 'Se puede entrar cualquier día.'
          : `Se entra sólo ${minimo.dias_checkin.map((d) => NOMBRE_DIA[d]).join(' o ')}.`}
      </p>

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
        <FormularioMinimo complejoId={complejoId} minimo={minimo} onListo={onListo} />
      )}
    </li>
  );
}

function FormularioMinimo({
  complejoId,
  minimo,
  onListo,
}: {
  complejoId: string;
  minimo: MinimoDelPanel | null;
  onListo: () => void;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [desde, setDesde] = useState(minimo?.desde ?? '');
  const [hasta, setHasta] = useState(minimo?.hasta ?? '');
  const [noches, setNoches] = useState(String(minimo?.noches ?? 2));
  const [etiqueta, setEtiqueta] = useState(minimo?.etiqueta ?? '');
  const [dias, setDias] = useState<number[]>(minimo?.dias_checkin ?? []);

  const n = Number(noches);
  const listo = !!desde && !!hasta && desde <= hasta && Number.isInteger(n) && n >= 1 && n <= 30;

  function alternar(d: number) {
    setDias((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));
  }

  function enviar() {
    if (!listo) return;
    empezar(async () => {
      const r = await guardarMinimo(
        complejoId,
        desde,
        hasta,
        n,
        dias,
        etiqueta,
        minimo?.id ?? null
      );
      setResultado(r);
      router.refresh();
      if (r.ok) onListo();
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-black/[0.03] p-3">
      <div className="grid gap-3 sm:grid-cols-3">
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
          <span className="opacity-70">Hasta (última noche)</span>
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
        <label className="block text-sm">
          <span className="opacity-70">Noches mínimo</span>
          <input
            type="number"
            min={1}
            max={30}
            value={noches}
            onChange={(e) => setNoches(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
      </div>

      <div>
        <p className="text-sm opacity-70">Días en que se puede entrar</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {NOMBRE_DIA.map((nombre, d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dias.includes(d)}
              onClick={() => alternar(d)}
              className={`rounded-lg border px-2.5 py-1 text-xs ${
                dias.includes(d)
                  ? 'border-black bg-black text-white'
                  : 'border-black/15 bg-white'
              }`}
            >
              {nombre}
            </button>
          ))}
        </div>
        {/* Ninguno y todos son lo mismo: sin restricción. Que el botón de
            guardar no se niegue con cero días elegidos es a propósito —elegir
            «ningún día» sería un tramo invendible, y eso no es lo que nadie
            quiso decir—. */}
        <p className="mt-1 text-xs opacity-60">
          {dias.length === 0 || dias.length === 7
            ? 'Sin ninguno elegido: se puede entrar cualquier día.'
            : `Sólo ${dias.map((d) => NOMBRE_DIA[d]).join(' o ')}.`}
        </p>
      </div>

      <label className="block text-sm">
        <span className="opacity-70">Cómo le decís (lo ves sólo vos)</span>
        <input
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          placeholder="Temporada alta"
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
        {enCurso ? 'Guardando…' : minimo ? 'Guardar los cambios' : 'Cargar el tramo'}
      </button>
    </div>
  );
}

/** Los bloques que van enteros. */
function Bloques({
  complejoId,
  reglas,
}: {
  complejoId: string;
  reglas: ReglasDelCalendario;
}) {
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Bloques que van enteros</h3>
        <button
          type="button"
          onClick={() => setEditando((e) => (e === 'nuevo' ? null : 'nuevo'))}
          className="text-sm underline opacity-70"
        >
          {editando === 'nuevo' ? 'Cancelar' : 'Agregar un bloque'}
        </button>
      </div>

      <p className="mt-1 text-xs opacity-60">
        El fin de semana largo que se toma completo o no se toma. Sin esto te
        queda la noche del domingo suelta, que no se la vas a alquilar a nadie.
      </p>

      {editando === 'nuevo' && (
        <FormularioBloque
          complejoId={complejoId}
          bloque={null}
          onListo={() => setEditando(null)}
        />
      )}

      {reglas.bloques.length === 0 ? (
        <p className="mt-3 text-sm opacity-60">
          No tenés bloques cargados: todas las noches se venden de a una.
        </p>
      ) : (
        <ul aria-label="Bloques que van enteros" className="mt-3 space-y-2">
          {reglas.bloques.map((b) => (
            <FilaBloque
              key={b.id}
              complejoId={complejoId}
              bloque={b}
              editando={editando === b.id}
              onEditar={() => setEditando((e) => (e === b.id ? null : b.id))}
              onListo={() => setEditando(null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaBloque({
  complejoId,
  bloque,
  editando,
  onEditar,
  onListo,
}: {
  complejoId: string;
  bloque: BloqueDelPanel;
  editando: boolean;
  onEditar: () => void;
  onListo: () => void;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function borrar() {
    empezar(async () => {
      const r = await borrarBloqueFijo(bloque.id);
      setResultado(r);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">
            {dia(bloque.check_in)} → {dia(bloque.check_out)}
          </span>
          <span className="ml-2 opacity-60">
            {bloque.noches} {bloque.noches === 1 ? 'noche' : 'noches'}
            {bloque.etiqueta && ` · ${bloque.etiqueta}`}
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
          <button
            type="button"
            onClick={borrar}
            disabled={enCurso}
            className="rounded-lg border border-black/15 px-3 py-1 text-xs disabled:opacity-40"
          >
            {enCurso ? 'Borrando…' : 'Borrar'}
          </button>
        </div>
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
        <FormularioBloque complejoId={complejoId} bloque={bloque} onListo={onListo} />
      )}
    </li>
  );
}

function FormularioBloque({
  complejoId,
  bloque,
  onListo,
}: {
  complejoId: string;
  bloque: BloqueDelPanel | null;
  onListo: () => void;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [checkIn, setCheckIn] = useState(bloque?.check_in ?? '');
  const [checkOut, setCheckOut] = useState(bloque?.check_out ?? '');
  const [etiqueta, setEtiqueta] = useState(bloque?.etiqueta ?? '');

  const listo = !!checkIn && !!checkOut && checkIn < checkOut;

  function enviar() {
    if (!listo) return;
    empezar(async () => {
      const r = await guardarBloqueFijo(
        complejoId,
        checkIn,
        checkOut,
        etiqueta,
        bloque?.id ?? null
      );
      setResultado(r);
      router.refresh();
      if (r.ok) onListo();
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-black/[0.03] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="opacity-70">Entrada</span>
          <input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
        <label className="block text-sm">
          <span className="opacity-70">Salida</span>
          <input
            type="date"
            value={checkOut}
            min={checkIn || undefined}
            onChange={(e) => setCheckOut(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
      </div>

      {/* Acá la salida es EXCLUSIVA, al revés que el «hasta» de los mínimos de
          arriba. Está escrito porque en la misma pantalla hay dos formularios
          con fechas que significan cosas distintas. */}
      <p className="text-xs opacity-60">
        La noche de la salida no entra: es el día en que puede entrar el próximo.
        {checkIn && checkOut && checkIn < checkOut && (
          <>
            {' '}
            Son <strong>{dias(checkIn, checkOut)}</strong>{' '}
            {dias(checkIn, checkOut) === 1 ? 'noche' : 'noches'} que van juntas.
          </>
        )}
      </p>

      <label className="block text-sm">
        <span className="opacity-70">Cómo le decís (lo ves sólo vos)</span>
        <input
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          placeholder="Finde largo de noviembre"
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
        {enCurso ? 'Guardando…' : bloque ? 'Guardar los cambios' : 'Cargar el bloque'}
      </button>
    </div>
  );
}

/**
 * Los días entre dos fechas ISO.
 *
 * Con `Date.UTC(…, 12)` y no con `new Date(iso)`: la segunda interpreta la
 * cadena como medianoche UTC y, al restar, un cambio de hora en una de las dos
 * puntas puede dejar 29,96 días en vez de 30.
 */
function dias(desde: string, hasta: string): number {
  const [ad, md, dd] = desde.split('-').map(Number);
  const [ah, mh, dh] = hasta.split('-').map(Number);
  return Math.round(
    (Date.UTC(ah, mh - 1, dh, 12) - Date.UTC(ad, md - 1, dd, 12)) / 86_400_000
  );
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
