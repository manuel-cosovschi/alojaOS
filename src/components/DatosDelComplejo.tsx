'use client';

/**
 * Los datos del complejo y sus unidades.
 *
 * ------------------------------------------------------------------
 * Esto arregla una mentira que ya estaba viva
 * ------------------------------------------------------------------
 * Cuando un complejo no tiene cargado dónde transferir, el panel avisa: «No
 * cargaste dónde transferir… **Se carga en los datos del complejo.**»
 *
 * Esa pantalla no existía. El panel le decía al dueño que fuera a un lugar al
 * que no podía ir, y el aviso le quedaba ahí para siempre por más que lo
 * leyera. Es exactamente la clase de respuesta que este sistema existe para no
 * dar, y la puse yo.
 *
 * Y el dato en cuestión es el único de todo el panel que cuesta plata cuando
 * falta: sin él, el huésped reserva, ve cuánto tiene que señar y no sabe a
 * dónde mandarlo.
 *
 * ------------------------------------------------------------------
 * Lo que la pantalla no ofrece
 * ------------------------------------------------------------------
 * **La dirección de la página.** La prohíbe un trigger en la base desde la 007:
 * el dueño mandó ese link por WhatsApp a cada huésped, y si cambiara, los que
 * tienen una reserva en curso no podrían ver en qué quedó. Se muestra, no se
 * edita, y dice por qué.
 *
 * **Los colores y las tipografías.** Se cambian una vez y equivocarse ahí deja
 * la página fea sin que el dueño sepa deshacerlo. Eso necesita vista previa, y
 * dar un campo de color sin forma de ver el resultado es peor que no darlo.
 *
 * ------------------------------------------------------------------
 * El botón de prender las reservas va aparte
 * ------------------------------------------------------------------
 * Es lo único de esta pantalla que cambia lo que puede hacer un desconocido en
 * este momento. Si fuera una casilla más del formulario, apretarla sin querer
 * mientras se corrige un teléfono sería dejar de vender sin saberlo.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  guardarDatosDelComplejo,
  habilitarReservas,
  guardarUnidad,
  borrarUnidad,
  type Resultado,
} from '@/actions/panel';
import type { ComplejoDelDuenio, UnidadDelPanel } from '@/lib/panel';

export function DatosDelComplejo({
  complejo,
  unidades,
  direccion,
}: {
  complejo: ComplejoDelDuenio;
  unidades: UnidadDelPanel[];
  /** La dirección pública, armada en el servidor con el dominio de hoy. */
  direccion: string;
}) {
  return (
    <div className="space-y-4">
      <Datos complejo={complejo} direccion={direccion} />
      <Interruptor complejo={complejo} />
      <Unidades complejoId={complejo.id} unidades={unidades} />
    </div>
  );
}

function Datos({
  complejo,
  direccion,
}: {
  complejo: ComplejoDelDuenio;
  direccion: string;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [nombre, setNombre] = useState(complejo.nombre);
  const [whatsapp, setWhatsapp] = useState(complejo.whatsapp ?? '');
  const [transferir, setTransferir] = useState(complejo.datos_transferencia ?? '');
  const [localidad, setLocalidad] = useState(complejo.localidad ?? '');
  const [email, setEmail] = useState(complejo.email ?? '');
  const [porcentaje, setPorcentaje] = useState(String(Number(complejo.porcentaje_sena)));
  const [horas, setHoras] = useState(String(complejo.horas_vencimiento_sena));

  const p = Number(porcentaje);
  const h = Number(horas);
  const listo =
    !!nombre.trim() && p > 0 && p <= 100 && Number.isInteger(h) && h >= 1 && h <= 168;

  function enviar() {
    if (!listo) return;
    empezar(async () => {
      const r = await guardarDatosDelComplejo(
        complejo.id,
        nombre,
        whatsapp,
        transferir,
        localidad,
        email,
        p,
        h
      );
      setResultado(r);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <h3 className="font-semibold">Datos del complejo</h3>

      {/* La dirección se muestra y no se edita. Decir por qué evita que el
          dueño la busque, no la encuentre y piense que es un bug. */}
      <p className="mt-1 text-xs opacity-60">
        Tu página vive en <code className="font-medium">{direccion}</code>. Esa
        dirección no se puede cambiar: es el link que les mandaste a tus
        huéspedes y tiene que seguir funcionando.
      </p>

      <div className="mt-3 space-y-3">
        {/* Dónde transferir va primero y ocupa el ancho entero: es el único
            campo de esta pantalla que cuesta plata cuando falta. */}
        <label className="block text-sm">
          <span className="opacity-70">
            Dónde te transfieren <strong>— alias, CBU y titular</strong>
          </span>
          <textarea
            value={transferir}
            onChange={(e) => setTransferir(e.target.value)}
            rows={3}
            placeholder={'Alias: micomplejo.mp\nCBU: 0000003100000000000001\nTitular: Nombre Apellido'}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
          <span className="mt-0.5 block text-xs opacity-60">
            Tal cual lo escribís acá se lo mostramos al huésped junto con el
            monto de la seña. Si está vacío, ve el monto y no sabe a dónde
            mandarlo.
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="opacity-70">Nombre del complejo</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
            />
          </label>
          <label className="block text-sm">
            <span className="opacity-70">WhatsApp</span>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="5492235550000"
              className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
            />
            {/* El número se limpia en la base, así que no hace falta pedirle al
                dueño que borre los espacios de lo que copió del teléfono. */}
            <span className="mt-0.5 block text-xs opacity-60">
              Pegalo como lo tengas: le sacamos el + y los espacios.
            </span>
          </label>
          <label className="block text-sm">
            <span className="opacity-70">Localidad</span>
            <input
              value={localidad}
              onChange={(e) => setLocalidad(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
            />
          </label>
          <label className="block text-sm">
            <span className="opacity-70">Tu mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
            />
          </label>
          <label className="block text-sm">
            <span className="opacity-70">Seña (% del total)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
            />
          </label>
          <label className="block text-sm">
            <span className="opacity-70">Horas para transferir</span>
            <input
              type="number"
              min={1}
              max={168}
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
            />
            {/* Es el plazo real que corre: pasado ese tiempo las noches se
                liberan solas. Decirlo porque el número no se explica. */}
            <span className="mt-0.5 block text-xs opacity-60">
              Pasado ese plazo, las noches se liberan solas.
            </span>
          </label>
        </div>
      </div>

      {resultado && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
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
        {enCurso ? 'Guardando…' : 'Guardar los datos'}
      </button>
    </div>
  );
}

/** Prender y apagar el alta pública. Con confirmación al apagar. */
function Interruptor({ complejo }: { complejo: ComplejoDelDuenio }) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const prendidas = complejo.reservas_habilitadas;

  function cambiar(a: boolean) {
    empezar(async () => {
      const r = await habilitarReservas(complejo.id, a);
      setResultado(r);
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <h3 className="font-semibold">Tu página {prendidas ? 'toma reservas' : 'no toma reservas'}</h3>
      <p className="mt-1 text-sm opacity-70">
        {prendidas
          ? 'Cualquiera que entre a tu página puede reservar y señar.'
          : 'La página se ve, pero nadie puede reservar. Sirve mientras cargás precios y todavía no querés recibir nada.'}
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

      {/* Apagar pide confirmación y prender no: prender de más se arregla
          apagando, apagar sin querer es dejar de vender sin saberlo. */}
      {prendidas ? (
        confirmando ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => cambiar(false)}
              disabled={enCurso}
              className="rounded-2xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {enCurso ? 'Apagando…' : 'Sí, dejar de tomar reservas'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="text-sm underline opacity-70"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="mt-3 rounded-2xl border border-black/15 px-4 py-2 text-sm"
          >
            Dejar de tomar reservas
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={() => cambiar(true)}
          disabled={enCurso}
          className="mt-3 rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {enCurso ? 'Prendiendo…' : 'Empezar a tomar reservas'}
        </button>
      )}
    </div>
  );
}

function Unidades({
  complejoId,
  unidades,
}: {
  complejoId: string;
  unidades: UnidadDelPanel[];
}) {
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Tus unidades</h3>
        <button
          type="button"
          onClick={() => setEditando((e) => (e === 'nueva' ? null : 'nueva'))}
          className="text-sm underline opacity-70"
        >
          {editando === 'nueva' ? 'Cancelar' : 'Agregar una unidad'}
        </button>
      </div>

      {editando === 'nueva' && (
        <FormularioUnidad
          complejoId={complejoId}
          unidad={null}
          onListo={() => setEditando(null)}
        />
      )}

      {unidades.length === 0 ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">
          <strong>No tenés ninguna unidad cargada</strong>, así que no hay nada
          que vender: tu página no ofrece nada.
        </p>
      ) : (
        <ul aria-label="Tus unidades" className="mt-3 space-y-2">
          {unidades.map((u) => (
            <FilaUnidad
              key={u.id}
              complejoId={complejoId}
              unidad={u}
              editando={editando === u.id}
              onEditar={() => setEditando((e) => (e === u.id ? null : u.id))}
              onListo={() => setEditando(null)}
            />
          ))}
        </ul>
      )}

      {/* Una unidad nueva no tiene precio en ningún período, así que arranca
          invendible. El aviso de precios lo dice, pero dicho acá llega en el
          momento en que el dueño acaba de crearla. */}
      <p className="mt-3 text-xs opacity-60">
        Una unidad nueva no se puede reservar hasta que le pongas precio en cada
        período. El aviso de arriba, en los precios, dice cuáles están sin
        precio.
      </p>
    </div>
  );
}

function FilaUnidad({
  complejoId,
  unidad,
  editando,
  onEditar,
  onListo,
}: {
  complejoId: string;
  unidad: UnidadDelPanel;
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
      const r = await borrarUnidad(unidad.id);
      setResultado(r);
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className={unidad.activa ? '' : 'opacity-50'}>
          <span className="font-medium">{unidad.nombre}</span>
          <span className="ml-2 opacity-60">
            {unidad.codigo}
            {!unidad.activa && ' · fuera de circulación'}
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
        <FormularioUnidad complejoId={complejoId} unidad={unidad} onListo={onListo} />
      )}
    </li>
  );
}

function FormularioUnidad({
  complejoId,
  unidad,
  onListo,
}: {
  complejoId: string;
  unidad: UnidadDelPanel | null;
  onListo: () => void;
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [codigo, setCodigo] = useState(unidad?.codigo ?? '');
  const [nombre, setNombre] = useState(unidad?.nombre ?? '');
  // Salen de la unidad, no de un valor por omisión. La primera versión
  // arrancaba en '4' siempre, así que editarle el nombre a una unidad de seis
  // le bajaba la capacidad a cuatro sin que nada lo dijera.
  const [capacidad, setCapacidad] = useState(String(unidad?.capacidad_maxima ?? 4));
  const [sugerencia, setSugerencia] = useState(unidad?.sugerencia_ocupacion ?? '');
  const [activa, setActiva] = useState(unidad?.activa ?? true);

  const c = Number(capacidad);
  const listo = !!codigo.trim() && !!nombre.trim() && Number.isInteger(c) && c >= 1 && c <= 50;

  function enviar() {
    if (!listo) return;
    empezar(async () => {
      const r = await guardarUnidad(
        complejoId,
        codigo,
        nombre,
        c,
        sugerencia,
        unidad?.orden ?? null,
        activa,
        unidad?.id ?? null
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
          <span className="opacity-70">Código corto</span>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="C1"
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="opacity-70">Nombre, como lo ve el huésped</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Cabaña del fondo"
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="opacity-70">Cuánta gente entra</span>
          <input
            type="number"
            min={1}
            max={50}
            value={capacidad}
            onChange={(e) => setCapacidad(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="opacity-70">Cómo se la recomendás (opcional)</span>
          <input
            value={sugerencia}
            onChange={(e) => setSugerencia(e.target.value)}
            placeholder="máx 4, ideal 2 adultos y 2 chicos"
            className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
          />
        </label>
      </div>

      {/* Sacar de circulación es lo que casi siempre se quiso decir al apretar
          borrar: la saca de la página sin tirar su historial de reservas. */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={!activa}
          onChange={(e) => setActiva(!e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="opacity-70">Fuera de circulación</span>
          <span className="block text-xs opacity-60">
            Deja de aparecer en tu página y nadie la puede reservar, pero sus
            reservas y su historial quedan. Es lo que conviene en vez de
            borrarla.
          </span>
        </span>
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
        {enCurso ? 'Guardando…' : unidad ? 'Guardar los cambios' : 'Agregar la unidad'}
      </button>
    </div>
  );
}
