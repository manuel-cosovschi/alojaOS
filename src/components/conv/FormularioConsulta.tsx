'use client';

import { useState } from 'react';
import { enviarConsulta, type ResultadoConsulta } from '@/app/conv/acciones';
import { TIPOS_DE_CONSULTA } from '@/lib/conv/consulta';
import { capturarAtribucion } from '@/lib/conv/atribucion';
import { rastrear } from '@/lib/conv/eventos';
import { NOCHE } from '@/lib/marca-alojaos';

/**
 * El formulario de consulta: cuatro datos obligatorios y dos opcionales.
 *
 * `Lead` sale **después** de que el servidor confirmó que guardó la consulta,
 * con el mismo `eventId` que el servidor mandó a Meta. Si falló, no sale nada.
 */

const campo: React.CSSProperties = {
  background: 'rgba(0,0,0,.25)',
  border: '1px solid rgba(255,255,255,.16)',
  color: NOCHE.texto,
};
const CLASE_CAMPO = 'mt-1.5 block w-full rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[#6fd6ae]/40';

export function FormularioConsulta() {
  const [estado, setEstado] = useState<'listo' | 'enviando' | 'enviado'>('listo');
  const [error, setError] = useState<Extract<ResultadoConsulta, { ok: false }> | null>(null);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (estado === 'enviando') return;
    setEstado('enviando');
    setError(null);
    try {
      const r = await enviarConsulta(new FormData(e.currentTarget));
      if (r.ok) {
        rastrear('Lead', { producto: 'alojaos', atribucion: capturarAtribucion(), eventId: r.eventId });
        setEstado('enviado');
      } else {
        setError(r);
        setEstado('listo');
      }
    } catch {
      setError({ ok: false, error: 'Se cortó la conexión. Tus datos siguen acá: probá de nuevo.' });
      setEstado('listo');
    }
  }

  const tarjeta: React.CSSProperties = { background: NOCHE.tarjeta, border: `1px solid ${NOCHE.borde}` };

  if (estado === 'enviado') {
    return (
      <div className="rounded-2xl p-8 text-center" style={tarjeta} role="status">
        <p className="text-lg font-bold">Recibimos tu consulta</p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>
          Te escribimos nosotros, una persona, por el medio que dejaste.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={alEnviar} className="space-y-4 rounded-2xl p-6" style={tarjeta} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Tu nombre
          <input name="nombre" autoComplete="name" required className={CLASE_CAMPO} style={campo} aria-invalid={error?.campo === 'nombre'} />
        </label>
        <label className="block text-sm font-semibold">
          Tu complejo
          <input name="complejo" autoComplete="organization" required placeholder="Ej.: Cabañas del Bosque" className={CLASE_CAMPO} style={campo} aria-invalid={error?.campo === 'complejo'} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <label className="block text-sm font-semibold">
          WhatsApp o mail
          <input name="contacto" autoComplete="tel" required placeholder="223 555 5555 o vos@mail.com" className={CLASE_CAMPO} style={campo} aria-invalid={error?.campo === 'contacto'} />
        </label>
        <label className="block text-sm font-semibold">
          Unidades <span className="font-normal" style={{ color: NOCHE.textoSuave }}>(opcional)</span>
          <input name="unidades" inputMode="numeric" placeholder="Ej.: 6" className={CLASE_CAMPO} style={campo} />
        </label>
      </div>
      <label className="block text-sm font-semibold">
        ¿Qué necesitás?
        <select name="tipo" defaultValue="demo" className={CLASE_CAMPO} style={campo}>
          {Object.entries(TIPOS_DE_CONSULTA).map(([v, t]) => (
            <option key={v} value={v} style={{ color: '#000' }}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Contanos algo más <span className="font-normal" style={{ color: NOCHE.textoSuave }}>(opcional)</span>
        <textarea name="mensaje" rows={3} placeholder="Cómo tomás las reservas hoy, por dónde vendés…" className={CLASE_CAMPO} style={campo} />
      </label>
      <input name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      {error && (
        <p role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(209,90,66,.14)', border: '1px solid rgba(209,90,66,.4)' }}>
          {error.error}
        </p>
      )}

      <button
        type="submit"
        disabled={estado === 'enviando'}
        className="w-full rounded-xl px-6 py-3.5 text-[15px] font-bold text-white transition hover:brightness-110 disabled:opacity-70"
        style={{ background: NOCHE.accion }}
      >
        {estado === 'enviando' ? 'Enviando…' : 'Quiero que me escriban'}
      </button>
      <p className="text-xs leading-relaxed" style={{ color: NOCHE.textoSuave }}>
        Usamos estos datos sólo para contestarte. No los compartimos ni te sumamos a ninguna lista.{' '}
        <a href="/privacidad" className="underline underline-offset-2">Privacidad</a>.
      </p>
    </form>
  );
}
