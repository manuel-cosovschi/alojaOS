import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/supabase/sesion';
import { misComplejos, senasPendientes, saludDelVencimiento } from '@/lib/panel';
import { Senas } from '@/components/Senas';
import { SaludDelReloj } from '@/components/SaludDelReloj';
import { salir } from '@/actions/sesion';

/**
 * El panel del dueño.
 *
 * Lo primero que tiene que mostrar es lo único que es urgente: las señas que
 * esperan que él las revise, con su vencimiento a la vista. Todo lo demás
 * —precios, calendario, objetivos— se puede hacer cuando haya tiempo; una seña
 * que vence en dos horas, no.
 *
 * No se cachea nunca: muestra plazos que corren y decisiones que otro puede
 * haber tomado desde su teléfono hace un minuto.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Panel — AlojaOS' };

export default async function Panel() {
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login');

  const complejos = await misComplejos();
  const salud = await saludDelVencimiento();

  // Las señas de cada complejo, en paralelo: son consultas independientes y
  // esperarlas en fila haría que un dueño con tres complejos espere el triple.
  const porComplejo = await Promise.all(
    complejos.map(async (c) => ({ complejo: c, senas: await senasPendientes(c.id) }))
  );

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1b2b26]">
      <header className="border-b border-black/10 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-baseline justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">AlojaOS</h1>
            <p className="text-xs opacity-60">{usuario.email}</p>
          </div>
          <form action={salir}>
            <button type="submit" className="text-sm underline opacity-70">
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-8">
        {complejos.length === 0 ? (
          <SinComplejos />
        ) : (
          <>
            {salud && <SaludDelReloj salud={salud} />}

            {porComplejo.map(({ complejo, senas }) => (
              <section key={complejo.id}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{complejo.nombre}</h2>
                  <a
                    className="text-sm underline opacity-70"
                    href={`/${complejo.slug}`}
                    // La página pública vive en el subdominio del complejo, no
                    // acá. El enlace se arma con el slug para que el dueño
                    // pueda ver lo que ve un huésped.
                  >
                    ver la página de reservas
                  </a>
                </div>

                {!complejo.datos_transferencia && <SinDatosBancarios slug={complejo.slug} />}

                <Senas
                  senas={senas}
                  moneda={complejo.moneda}
                  zonaHoraria={complejo.zona_horaria}
                />
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

function SinComplejos() {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-6">
      <p className="font-medium">Tu cuenta todavía no está asociada a ningún complejo.</p>
      <p className="mt-2 text-sm opacity-70">
        Si acabás de contratar AlojaOS, escribinos y lo dejamos listo. Si ya
        tenías acceso y dejaste de verlo, avisanos: no es algo que se desactive
        solo.
      </p>
    </div>
  );
}

/**
 * Sin datos bancarios el huésped reserva y no sabe a dónde transferir.
 *
 * Es una advertencia y no un error, porque la reserva funciona: la pantalla del
 * huésped le ofrece escribir por WhatsApp. Pero es la clase de cosa que nadie
 * nota desde adentro, así que el panel la dice en vez de esperar que el dueño
 * se dé cuenta por una queja.
 */
function SinDatosBancarios({ slug }: { slug: string }) {
  return (
    <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>No cargaste dónde transferir.</strong> El huésped que reserve en{' '}
      <code>{slug}</code> va a ver la seña y no el alias ni el CBU, y le vamos a
      ofrecer que te escriba por WhatsApp. Se carga en los datos del complejo.
    </div>
  );
}
