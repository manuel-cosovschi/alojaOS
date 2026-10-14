import type { Metadata } from 'next';
import { leerComplejo, nochesOcupadas, slugDeLaPeticion } from '@/lib/complejo';
import { hoyISO } from '@/lib/fechas';
import { Reservar } from '@/components/Reservar';
import { datosParaTransferir } from '@/actions/comprobante';
import { Comercial } from '@/components/comercial/Comercial';
import { direccionDelComplejo } from '@/lib/tenant';

/**
 * La raíz.
 *
 * En un subdominio (`sucomplejo.alojaos.shop`) es la página de reservas de ese
 * complejo. En el dominio principal es la página comercial de AlojaOS.
 *
 * No se cachea: muestra qué noches están ocupadas, y una página de
 * disponibilidad vieja le ofrece a alguien una fecha que ya se tomó.
 */
export const dynamic = 'force-dynamic';

/**
 * El título de la pestaña y la tarjeta que se ve al compartir el enlace.
 *
 * ==================================================================
 * Esto era un bug del producto, no un detalle
 * ==================================================================
 * Sin esto, las dos páginas heredaban el título del layout: **«AlojaOS»**. O
 * sea que el huésped que abría la página de Cabañas del Sol veía «AlojaOS» en
 * la pestaña, y si le pasaba el enlace a su familia por WhatsApp, la vista
 * previa decía «AlojaOS — El sistema de reservas de tu complejo».
 *
 * Toda la propuesta es «tu página, con tu nombre y tus colores», y el único
 * lugar donde el huésped ve un nombre antes de entrar decía el nuestro.
 *
 * Y del lado de la página comercial faltaba lo mismo por el otro motivo: el
 * canal por el que se reparte es un mensaje, y un enlace sin vista previa en
 * WhatsApp es un renglón gris. Es la parte de la página que más gente ve.
 */
export async function generateMetadata(): Promise<Metadata> {
  const slug = await slugDeLaPeticion();

  if (!slug) {
    const titulo = 'AlojaOS · Reservas para complejos de 3 a 15 unidades';
    const descripcion =
      'Tu propia página de reservas, con tu nombre y tus colores. El huésped elige ' +
      'las noches, ve el precio, transfiere la seña y sube el comprobante. Sin comisión ' +
      'por reserva. Y nunca dos reservas sobre la misma unidad y la misma noche.';
    return {
      title: titulo,
      description: descripcion,
      openGraph: {
        title: titulo,
        description: descripcion,
        type: 'website',
        locale: 'es_AR',
        siteName: 'AlojaOS',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'AlojaOS' }],
      },
      twitter: { card: 'summary_large_image', title: titulo, description: descripcion, images: ['/og.png'] },
    };
  }

  const complejo = await leerComplejo(slug);
  if (!complejo) return { title: 'No encontramos este complejo' };

  const donde = [complejo.localidad, complejo.provincia].filter(Boolean).join(', ');
  const titulo = donde ? `${complejo.nombre} · ${donde}` : complejo.nombre;
  // La descripción que cargó el dueño, si la cargó. Si no, una que al menos
  // dice qué es la página, y no la del producto.
  const descripcion =
    complejo.descripcion?.trim() ||
    `Consultá disponibilidad y reservá tus noches en ${complejo.nombre}${donde ? `, ${donde}` : ''}.`;

  return {
    title: titulo,
    description: descripcion,
    openGraph: {
      title: titulo,
      description: descripcion,
      type: 'website',
      locale: 'es_AR',
      siteName: complejo.nombre,
      url: direccionDelComplejo(slug) || undefined,
    },
    // Nada de nuestra marca acá: esta página es del complejo.
    twitter: { card: 'summary', title: titulo, description: descripcion },
  };
}

export default async function Pagina() {
  const slug = await slugDeLaPeticion();

  if (!slug) return <Comercial />;

  const complejo = await leerComplejo(slug);
  if (!complejo) return <NoExiste slug={slug} />;

  const ocupadas = await nochesOcupadas(complejo.id);
  const hoy = hoyISO(complejo.zona_horaria);
  // Los datos bancarios van aparte de `complejo_publico` a propósito: así no
  // quedan en el HTML de cada visita, ni de cada robot que pase por la página.
  // Hacen falta recién cuando alguien reservó.
  const { datos: datosTransferencia } = complejo.reservas_habilitadas
    ? await datosParaTransferir(slug)
    : { datos: null };

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
          <Reservar
            complejo={complejo}
            ocupadas={ocupadas}
            hoy={hoy}
            datosTransferencia={datosTransferencia}
          />
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


