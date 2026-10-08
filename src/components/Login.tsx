'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { entrar, type ResultadoLogin } from '@/actions/sesion';

export function Login() {
  const router = useRouter();
  const [estado, accion, pendiente] = useActionState<ResultadoLogin | null, FormData>(
    entrar,
    null
  );

  // La redirección se hace acá y no en la acción del servidor porque un
  // `redirect()` adentro de una acción con `useActionState` se pierde: la
  // acción tiene que devolver el resultado para poder mostrar el error.
  useEffect(() => {
    if (estado?.ok) router.replace('/panel');
  }, [estado, router]);

  return (
    <form action={accion} className="mt-6 space-y-3">
      <label className="block text-sm">
        <span className="opacity-70">Mail</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
        />
      </label>

      <label className="block text-sm">
        <span className="opacity-70">Contraseña</span>
        <input
          name="clave"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
        />
      </label>

      {estado && !estado.ok && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{estado.mensaje}</p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-2xl bg-black px-6 py-3 font-semibold text-white transition disabled:opacity-40"
      >
        {pendiente ? 'Entrando…' : 'Entrar'}
      </button>

      <p className="pt-2 text-xs opacity-60">
        Si no te acordás la contraseña, escribinos: el envío de mails todavía no
        está configurado, así que el botón de «olvidé mi contraseña» no andaría y
        preferimos no ponerlo.
      </p>
    </form>
  );
}
