'use server';

/**
 * Entrar y salir.
 *
 * Con contraseña y no con enlace mágico, y conviene decir por qué: el enlace
 * mágico es mejor para un dueño que no quiere acordarse de nada, pero necesita
 * que salgan mails. El SMTP propio todavía no está configurado, y el de
 * Supabase manda 2 por hora desde un dominio que no es el nuestro. Ofrecer un
 * botón que manda un mail que no llega es peor que no ofrecerlo: la persona se
 * queda esperando y no sabe si falló el mail o escribió mal el mail.
 *
 * Cuando el correo esté, el enlace mágico se agrega acá y la contraseña queda
 * como alternativa.
 */

import { redirect } from 'next/navigation';
import { clienteConSesion } from '@/lib/supabase/sesion';

export type ResultadoLogin = { ok: false; mensaje: string } | { ok: true };

export async function entrar(_previo: unknown, datos: FormData): Promise<ResultadoLogin> {
  const email = String(datos.get('email') ?? '').trim();
  const clave = String(datos.get('clave') ?? '');

  if (!email || !clave) {
    return { ok: false, mensaje: 'Faltan el mail o la contraseña.' };
  }

  const supabase = await clienteConSesion();
  const { error } = await supabase.auth.signInWithPassword({ email, password: clave });

  if (error) {
    console.error('[entrar] no pudo entrar:', error.message);
    // Un mensaje igual para "no existe ese mail" y para "la contraseña está
    // mal": distinguirlos le dice a cualquiera qué mails tienen cuenta.
    return { ok: false, mensaje: 'El mail o la contraseña no coinciden.' };
  }

  return { ok: true };
}

export async function salir() {
  const supabase = await clienteConSesion();
  await supabase.auth.signOut();
  redirect('/login');
}
