import { usuarioActual } from '@/lib/supabase/sesion';
import { redirect } from 'next/navigation';
import { Login } from '@/components/Login';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Entrar — AlojaOS' };

export default async function PaginaLogin() {
  // Ya logueado: al panel. Un formulario de login que te deja entrar de nuevo
  // cuando ya estás adentro no hace nada y confunde.
  if (await usuarioActual()) redirect('/panel');

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">AlojaOS</h1>
      <p className="mt-1 text-sm opacity-70">Entrá para ver las reservas de tu complejo.</p>
      <Login />
    </main>
  );
}
