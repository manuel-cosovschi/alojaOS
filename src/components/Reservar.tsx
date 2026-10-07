'use client';

/**
 * El flujo de reserva: elegir unidad, elegir noches, dejar los datos.
 *
 * Lo que se muestra acá es una previsualización. La verdad la dice
 * `crear_reserva()` en la base: valida las mismas reglas antes de escribir y la
 * restricción de exclusión impide la superposición. Si las dos no coincidieran,
 * la que manda es la base — por eso el total que se guarda lo calcula ella y no
 * este archivo, aunque acá se muestre un número.
 *
 * El motivo de mostrarlo igual: alguien que elige fechas quiere ver el precio
 * mientras elige, no después de completar un formulario.
 */

import { useMemo, useState } from 'react';
import type { Complejo } from '@/lib/complejo';
import { type DiaISO } from '@/lib/fechas';
import { validar, type Reglas } from '@/lib/calendario';
import { cotizar } from '@/lib/precios';
import { Calendario, type Ocupada } from './Calendario';
import { pedirReserva, type Resultado } from '@/actions/reservar';

interface Props {
  complejo: Complejo;
  ocupadas: Array<{ unidad_id: string; codigo: string; check_in: string; check_out: string }>;
  hoy: DiaISO;
}

const plata = (n: number, moneda: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(n);

export function Reservar({ complejo, ocupadas, hoy }: Props) {
  const [unidadId, setUnidadId] = useState<string>(complejo.unidades[0]?.id ?? '');
  const [checkIn, setCheckIn] = useState<DiaISO | null>(null);
  const [checkOut, setCheckOut] = useState<DiaISO | null>(null);
  const [personas, setPersonas] = useState(2);
  const [datos, setDatos] = useState({ nombre: '', dni: '', email: '', telefono: '', notas: '' });
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const unidad = complejo.unidades.find((u) => u.id === unidadId);

  if (!complejo.calendario) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white/60 p-6">
        <p className="font-medium">Todavía no están cargadas las fechas disponibles.</p>
        {complejo.whatsapp && (
          <p className="mt-2 text-sm">
            Escribinos por{' '}
            <a className="underline" href={`https://wa.me/${complejo.whatsapp}`} target="_blank" rel="noopener">
              WhatsApp
            </a>{' '}
            y lo vemos.
          </p>
        )}
      </div>
    );
  }

  const reglas: Reglas = {
    hoy,
    config: complejo.calendario,
    bloques: complejo.bloques_fijos,
    minimos: complejo.minimos_noches,
  };

  // Sólo las de esta unidad: las de otra no le impiden nada a esta.
  const ocupadasDeLaUnidad: Ocupada[] = useMemo(
    () => ocupadas.filter((o) => o.unidad_id === unidadId),
    [ocupadas, unidadId]
  );

  const veredicto = checkIn && checkOut ? validar(reglas, checkIn, checkOut) : null;

  const cotizacion =
    checkIn && checkOut && unidad && veredicto?.ok
      ? cotizar(checkIn, checkOut, unidad.codigo, complejo.periodos_precio, complejo.porcentaje_sena)
      : null;

  const listo =
    !!unidad &&
    !!checkIn &&
    !!checkOut &&
    veredicto?.ok === true &&
    !!cotizacion &&
    personas >= 1 &&
    personas <= unidad.capacidad_maxima &&
    !!datos.nombre.trim() &&
    !!datos.dni.trim() &&
    !!datos.email.trim() &&
    !!datos.telefono.trim();

  async function enviar() {
    if (!listo || !unidad || !checkIn || !checkOut) return;
    setEnviando(true);
    setResultado(null);
    try {
      const r = await pedirReserva({
        slug: complejo.slug,
        unidadId: unidad.id,
        checkIn,
        checkOut,
        personas,
        nombre: datos.nombre,
        dni: datos.dni,
        email: datos.email,
        telefono: datos.telefono,
        notas: datos.notas,
      });
      setResultado(r);
      if (r.ok) {
        setCheckIn(null);
        setCheckOut(null);
      }
    } finally {
      setEnviando(false);
    }
  }

  if (resultado?.ok) {
    return <Registrada complejo={complejo} resultado={resultado} />;
  }

  return (
    <div className="space-y-6">
      {/* 1. La unidad */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
          Elegí la unidad
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {complejo.unidades.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                setUnidadId(u.id);
                setCheckIn(null);
                setCheckOut(null);
              }}
              className={[
                'rounded-2xl border p-4 text-left transition',
                u.id === unidadId
                  ? 'border-marca-principal bg-marca-principal/10'
                  : 'border-black/10 bg-white/60 hover:bg-white',
              ].join(' ')}
              aria-pressed={u.id === unidadId}
            >
              <div className="font-medium">{u.nombre}</div>
              <div className="mt-0.5 text-xs opacity-70">
                {u.sugerencia_ocupacion || `Hasta ${u.capacidad_maxima} personas`}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 2. Las noches */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
          Elegí las noches
        </h2>
        <Calendario
          reglas={reglas}
          ocupadas={ocupadasDeLaUnidad}
          checkIn={checkIn}
          checkOut={checkOut}
          onElegir={(ci, co) => {
            setCheckIn(ci);
            setCheckOut(co);
            setResultado(null);
          }}
        />

        {veredicto && !veredicto.ok && (
          <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {veredicto.mensaje}
          </p>
        )}

        {checkIn && checkOut && veredicto?.ok && !cotizacion && (
          <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Todavía no tenemos tarifa publicada para esas fechas. Dejanos tus datos
            igual y te confirmamos el precio.
          </p>
        )}

        {cotizacion && (
          <div className="mt-2 rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>
                <strong>{cotizacion.noches}</strong>{' '}
                {cotizacion.noches === 1 ? 'noche' : 'noches'}
              </span>
              <span>
                Total: <strong>{plata(cotizacion.total, complejo.moneda)}</strong>
              </span>
              <span>
                Seña ({complejo.porcentaje_sena}%):{' '}
                <strong>{plata(cotizacion.sena, complejo.moneda)}</strong>
              </span>
            </div>
            {cotizacion.precioMin !== cotizacion.precioMax && (
              <p className="mt-1 text-xs opacity-70">
                La estadía cruza de temporada: cada noche se cobra según su fecha.
              </p>
            )}
          </div>
        )}
      </section>

      {/* 3. Los datos */}
      {checkIn && checkOut && veredicto?.ok && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
            Tus datos
          </h2>
          <div className="grid gap-3 rounded-2xl border border-black/10 bg-white/60 p-4 sm:grid-cols-2">
            <Campo
              etiqueta="Personas"
              tipo="number"
              valor={String(personas)}
              min={1}
              max={unidad?.capacidad_maxima}
              onChange={(v) => setPersonas(Math.max(1, Number(v) || 1))}
              ayuda={unidad ? `Hasta ${unidad.capacidad_maxima}` : undefined}
            />
            <Campo
              etiqueta="Nombre y apellido"
              valor={datos.nombre}
              onChange={(v) => setDatos({ ...datos, nombre: v })}
            />
            <Campo etiqueta="DNI" valor={datos.dni} onChange={(v) => setDatos({ ...datos, dni: v })} />
            <Campo
              etiqueta="Teléfono"
              tipo="tel"
              valor={datos.telefono}
              onChange={(v) => setDatos({ ...datos, telefono: v })}
            />
            <Campo
              etiqueta="Mail"
              tipo="email"
              valor={datos.email}
              onChange={(v) => setDatos({ ...datos, email: v })}
            />
            <Campo
              etiqueta="Algo que quieras avisar"
              valor={datos.notas}
              onChange={(v) => setDatos({ ...datos, notas: v })}
            />
          </div>

          {unidad && personas > unidad.capacidad_maxima && (
            <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {unidad.nombre} admite hasta {unidad.capacidad_maxima} personas.
            </p>
          )}

          {resultado && !resultado.ok && (
            <p className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
              {resultado.mensaje}
            </p>
          )}

          <button
            type="button"
            onClick={enviar}
            disabled={!listo || enviando}
            className="mt-4 w-full rounded-2xl bg-marca-principal px-6 py-3 font-semibold text-white transition disabled:opacity-40 sm:w-auto"
          >
            {enviando ? 'Registrando…' : 'Reservar'}
          </button>

          <p className="mt-2 text-xs opacity-60">
            Te guardamos la unidad por {complejo.horas_vencimiento_sena}{' '}
            {complejo.horas_vencimiento_sena === 1 ? 'hora' : 'horas'} mientras
            transferís la seña.
          </p>
        </section>
      )}
    </div>
  );
}

function Registrada({
  complejo,
  resultado,
}: {
  complejo: Complejo;
  resultado: Extract<Resultado, { ok: true }>;
}) {
  const vence = new Date(resultado.venceEl).toLocaleString('es-AR', {
    timeZone: complejo.zona_horaria,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="font-semibold text-emerald-900">Te guardamos la unidad</h2>
        <p className="mt-2 text-sm text-emerald-900">
          {resultado.noches} {resultado.noches === 1 ? 'noche' : 'noches'} ·{' '}
          Seña a transferir: <strong>{plata(resultado.sena, complejo.moneda)}</strong> de{' '}
          {plata(resultado.total, complejo.moneda)}.
        </p>
        <p className="mt-2 text-sm text-emerald-900">
          Vence el <strong>{vence}</strong>. Si no llega la transferencia antes de
          esa hora, las fechas se liberan solas.
        </p>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white/60 p-6 text-sm">
        <p className="font-medium">Qué sigue</p>
        <p className="mt-2 opacity-80">
          Falta subir el comprobante de la transferencia: esa parte todavía no
          está construida.
          {complejo.whatsapp && (
            <>
              {' '}Por ahora mandanoslo por{' '}
              <a
                className="underline"
                href={`https://wa.me/${complejo.whatsapp}`}
                target="_blank"
                rel="noopener"
              >
                WhatsApp
              </a>
              .
            </>
          )}
        </p>
        <p className="mt-3 text-xs opacity-60">Número de reserva: {resultado.id}</p>
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  onChange,
  tipo = 'text',
  min,
  max,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
  min?: number;
  max?: number;
  ayuda?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="opacity-70">{etiqueta}</span>
      <input
        type={tipo}
        value={valor}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-marca-principal"
      />
      {ayuda && <span className="mt-0.5 block text-xs opacity-50">{ayuda}</span>}
    </label>
  );
}
