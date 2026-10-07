import { leerComplejo, nochesOcupadas, slugDeLaPeticion } from '@/lib/complejo';
import { hoyISO } from '@/lib/fechas';
import { Reservar } from '@/components/Reservar';

/**
 * La raíz.
 *
 * En un subdominio (`sucomplejo.alojaos.shop`) es la página de reservas de ese
 * complejo. En el dominio principal va a ser la página comercial de AlojaOS,
 * que todavía no está.
 *
 * No se cachea: muestra qué noches están ocupadas, y una página de
 * disponibilidad vieja le ofrece a alguien una fecha que ya se tomó.
 */
export const dynamic = 'force-dynamic';

export default async function Pagina() {
  const slug = await slugDeLaPeticion();

  if (!slug) return <PaginaPrincipal />;

  const complejo = await leerComplejo(slug);
  if (!complejo) return <NoExiste slug={slug} />;

  const ocupadas = await nochesOcupadas(complejo.id);
  const hoy = hoyISO(complejo.zona_horaria);

  const { marca } = complejo;
  const estilo = {
    '--marca-principal': marca.color_principal,
    '--marca-fondo': marca.color_fondo,
    '--marca-texto': marca.color_texto,
    '--marca-acento': marca.color_acento,
    ...(marca.tipografia_titulos ? { '--fuente-titulo': marca.tipografia_titulos } : {}),
    ...(marca.tipografia_cuerpo ? { '--fuente-cuerpo': marca.tipografia_cuerpo } : {}),
  } as React.CSSProperties;

  return (
    <div style={estilo} className="min-h-screen">
      <header className="border-b border-black/10 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold sm:text-3xl">{complejo.nombre}</h1>
          {(complejo.localidad || complejo.provincia) && (
            <p className="mt-1 text-sm opacity-70">
              {[complejo.localidad, complejo.provincia].filter(Boolean).join(', ')}
            </p>
          )}
          {complejo.descripcion && <p className="mt-3 max-w-prose text-sm">{complejo.descripcion}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        {complejo.reservas_habilitadas ? (
          <Reservar complejo={complejo} ocupadas={ocupadas} hoy={hoy} />
        ) : (
          <CerradoPorAhora whatsapp={complejo.whatsapp} />
        )}
      </main>

      <footer className="border-t border-black/10 px-4 py-6 text-sm sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2">
          {/* Cada enlace aparece sólo si el complejo cargó ese dato: un botón
              que no lleva a ningún lado es peor que no tener el botón. */}
          {complejo.whatsapp && (
            <a className="underline" href={`https://wa.me/${complejo.whatsapp}`} target="_blank" rel="noopener">
              WhatsApp
            </a>
          )}
          {complejo.instagram && (
            <a className="underline" href={`https://instagram.com/${complejo.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener">
              Instagram
            </a>
          )}
          {complejo.email && (
            <a className="underline" href={`mailto:${complejo.email}`}>
              {complejo.email}
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}

function CerradoPorAhora({ whatsapp }: { whatsapp: string | null }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-6">
      <p className="font-medium">Por el momento no estamos tomando reservas por la página.</p>
      {whatsapp && (
        <p className="mt-2 text-sm">
          Escribinos por{' '}
          <a className="underline" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener">
            WhatsApp
          </a>{' '}
          y lo vemos.
        </p>
      )}
    </div>
  );
}

function NoExiste({ slug }: { slug: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <h1 className="text-xl font-semibold">No encontramos este complejo</h1>
      <p className="mt-2 text-sm opacity-70">
        La dirección <code>{slug}</code> no corresponde a ningún complejo activo.
      </p>
    </main>
  );
}

function PaginaPrincipal() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">AlojaOS</h1>
      <p className="mt-2 text-sm opacity-70">
        El sistema de reservas de tu complejo. La página comercial todavía no está
        construida; cada complejo atiende en su propia dirección.
      </p>
    </main>
  );
}
