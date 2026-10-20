import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { slugDeLaPeticion } from '@/lib/complejo';
import { ENLACE_WHATSAPP, WHATSAPP_CONTACTO, WHATSAPP_SIN_CARGAR } from '@/lib/constants';
import { NOCHE } from '@/lib/marca-alojaos';
import { CASO } from '@/lib/caso';
import { PLANES } from '@/lib/precios-alojaos';
import { Captura, Marco, Telefono } from '@/components/comercial/Pantallas';
import { Video } from '@/components/comercial/Video';
import { Revelar } from '@/components/comercial/Revelar';
import { BotonDemo } from '@/components/comercial/BotonDemo';
import { Check } from '@/components/comercial/Iconos';
import { CAPTURAS_SACADAS_EL } from '@/components/comercial/capturas.generado';
import { VIDEOS_GRABADOS_EL } from '@/components/comercial/videos.generado';
import { Rastreo } from '@/components/conv/Rastreo';
import { FormularioConsulta } from '@/components/conv/FormularioConsulta';
import { VARIANTES, varianteDe } from './variantes';

/**
 * La página de conversión de AlojaOS: a donde llegan los anuncios.
 *
 * AlojaOS no se compra online: cada complejo tiene sus unidades, sus
 * temporadas y sus mínimos, y la puesta a punto la hacemos nosotros. Así que el
 * objetivo es uno solo —**la consulta**— y lo demás (WhatsApp, el demo) está
 * para el que prefiere otro camino, sin competir con el formulario.
 *
 * Sin menú, y sólo lo que el sistema hace hoy. Lo que no hace se dice en las
 * preguntas: no se conecta con Booking ni Airbnb, y el huésped no paga con
 * tarjeta. Un anuncio que trae a alguien que necesita eso trae una consulta que
 * no se cierra.
 *
 * En el subdominio de un complejo esta ruta no existe: ahí `/conv` sería la
 * página de venta de AlojaOS adentro de la página de reservas de un cliente.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'AlojaOS — Reservas para complejos de cabañas, sin comisión' },
  description:
    'Tu propia página de reservas: el huésped ve qué está libre, el precio y la seña, y transfiere a tu cuenta. Para complejos de 3 a 15 unidades. Sin comisión por reserva.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://alojaos.shop'),
  alternates: { canonical: '/conv' },
  openGraph: {
    title: 'AlojaOS — Tus cabañas se reservan solas',
    description: 'Tu página de reservas, con tu nombre. La seña va a tu cuenta, sin comisión.',
    siteName: 'AlojaOS',
    locale: 'es_AR',
    type: 'website',
    url: '/conv',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
};

const comoFecha = (iso: string) => iso.split('-').reverse().join('/');
const plata = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const HAY_WHATSAPP = WHATSAPP_CONTACTO !== WHATSAPP_SIN_CARGAR;

const tarjeta: React.CSSProperties = { background: NOCHE.tarjeta, border: `1px solid ${NOCHE.borde}` };

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-center text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: NOCHE.menta }}>
      {children}
    </p>
  );
}

function Titulo({ children, acento, como = 'h2' }: { children: React.ReactNode; acento?: string; como?: 'h1' | 'h2' }) {
  const Tag = como;
  return (
    <Tag
      className={`font-black italic uppercase tracking-[-0.03em] ${
        como === 'h1' ? 'text-[2.2rem] leading-[0.98] sm:text-5xl lg:text-[3.3rem]' : 'mt-4 text-center text-[1.8rem] leading-[1.03] sm:text-4xl'
      }`}
    >
      {children}
      {acento && (
        <>
          {' '}
          <span style={{ color: NOCHE.accionViva }}>{acento}</span>
        </>
      )}
    </Tag>
  );
}

function Boton({ href, children, secundario = false, evento }: { href: string; children: React.ReactNode; secundario?: boolean; evento?: string }) {
  const afuera = href.startsWith('http');
  return (
    <a
      href={href}
      target={afuera ? '_blank' : undefined}
      rel={afuera ? 'noopener' : undefined}
      data-conv-evento={evento}
      className={`inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-[15px] font-bold transition ${secundario ? 'hover:bg-white/5' : 'text-white hover:brightness-110'}`}
      style={secundario ? { border: `1px solid ${NOCHE.borde}` } : { background: NOCHE.accion }}
    >
      {children}
    </a>
  );
}

function Seccion({ id, hondo = false, children, ancho = 'max-w-6xl' }: { id?: string; hondo?: boolean; children: React.ReactNode; ancho?: string }) {
  return (
    <section id={id} className="px-5 py-16 md:py-24" style={{ background: hondo ? NOCHE.fondoHondo : NOCHE.fondo, borderTop: `1px solid ${NOCHE.borde}` }}>
      <div className={`mx-auto ${ancho}`}>{children}</div>
    </section>
  );
}

export default async function PaginaDeConversion({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  if (await slugDeLaPeticion()) notFound();
  const variante = VARIANTES[varianteDe((await searchParams).v)];

  return (
    <div style={{ background: NOCHE.fondo, color: NOCHE.texto, '--fuente-titulo': 'var(--font-aloja)', '--fuente-cuerpo': 'var(--font-aloja)' } as React.CSSProperties}>
      <style>{`html{color-scheme:dark;scroll-padding-top:4.5rem}body{background:${NOCHE.fondo}}`}</style>
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('con-js')" }} />
      <Revelar />
      <Rastreo producto="alojaos" />

      <header className="sticky top-0 z-30 backdrop-blur" style={{ background: 'rgba(6,25,27,.85)', borderBottom: `1px solid ${NOCHE.borde}` }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <span className="text-lg font-black italic tracking-tight">AlojaOS</span>
          <a href="#consulta" className="rounded-xl px-4 py-2 text-[13px] font-bold text-white" style={{ background: NOCHE.accion }}>
            Consultar
          </a>
        </div>
      </header>

      <main>
        {/* Hero: nunca se esconde. */}
        <section className="px-5 pb-14 pt-10 md:pb-20 md:pt-16">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: NOCHE.menta }}>
                {variante.para}
              </p>
              <div className="mt-5">
                <Titulo como="h1" acento={variante.acento}>
                  {variante.titulo}
                </Titulo>
              </div>
              <p className="mt-5 max-w-xl text-lg leading-relaxed" style={{ color: NOCHE.textoSuave }}>
                {variante.bajada}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Boton href="#consulta">Quiero que me escriban</Boton>
                {HAY_WHATSAPP && (
                  <Boton href={ENLACE_WHATSAPP} secundario evento="Contact">
                    Escribir por WhatsApp
                  </Boton>
                )}
              </div>
              <ul className="mt-7 grid gap-2 text-sm font-semibold sm:grid-cols-2">
                {['Sin comisión por reserva', 'La seña va a tu cuenta', 'Se usa desde el celular', `Desde ${plata(PLANES[0].mensual)} por mes`].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check color={NOCHE.menta} />
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm" style={{ color: NOCHE.textoTenue }}>
                Lo usa {CASO.nombre}, {CASO.unidades} cabañas en {CASO.localidad}.
              </p>
            </div>
            <div>
              <Telefono>
                <Video cual="reservar" />
              </Telefono>
              <p className="mt-3 text-center text-xs" style={{ color: NOCHE.textoTenue }}>
                Una reserva de punta a punta, grabada el {comoFecha(VIDEOS_GRABADOS_EL)} contra el demo, sin cortes.
              </p>
            </div>
          </div>
        </section>

        <Seccion hondo>
          <div data-revelar>
            <Rotulo>Lo que cambia</Rotulo>
            <Titulo acento="sin vos en el medio">Lo mismo de siempre,</Titulo>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ['Contestás «¿está libre?» todo el día', 'El huésped ve en tu página qué noches están libres y cuánto sale, antes de escribirte.'],
              ['Alguien reserva, no transfiere, y las noches quedan tomadas', 'La seña tiene un plazo que corre solo. Si vence, las noches vuelven a estar a la venta.'],
              ['Te da miedo tomar la misma noche dos veces', 'La base de datos no deja guardar dos reservas sobre la misma unidad y la misma noche.'],
            ].map(([antes, ahora], i) => (
              <div key={antes} data-revelar style={{ transitionDelay: `${i * 80}ms` }}>
                <div className="h-full rounded-2xl p-5" style={tarjeta}>
                  <p className="text-sm line-through" style={{ color: NOCHE.textoTenue }}>{antes}</p>
                  <p className="mt-3 text-[15px] leading-relaxed">{ahora}</p>
                </div>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div data-revelar>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: NOCHE.menta }}>Para vos</p>
              <h2 className="mt-4 text-[1.8rem] font-black italic uppercase leading-[1.03] tracking-[-0.03em] sm:text-4xl">
                Todo tu complejo, <span style={{ color: NOCHE.accionViva }}>en una pantalla</span>
              </h2>
              <ul className="mt-6 space-y-2.5 text-[15px]">
                {['Confirmar o rechazar una seña, con su comprobante', 'Precios por temporada', 'Cerrar fechas, con el motivo escrito', 'Mínimos de noches y días de entrada', 'Tu página con tus colores'].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <Check color={NOCHE.menta} />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <BotonDemo texto="Probar el demo guiado" />
              </div>
            </div>
            <div className="space-y-4" data-revelar>
              <Marco>
                <Captura cual="panel-senas" sizes="(max-width: 1024px) 92vw, 580px" />
              </Marco>
              <p className="text-sm" style={{ color: NOCHE.textoTenue }}>
                Captura del sistema del {comoFecha(CAPTURAS_SACADAS_EL)}.
              </p>
            </div>
          </div>
        </Seccion>

        <Seccion hondo>
          <div data-revelar>
            <Rotulo>Cómo arrancamos</Rotulo>
            <Titulo acento="andando">De la consulta a tu página</Titulo>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ['Una charla de veinte minutos', 'Cuántas unidades tenés, cómo cobrás y qué reglas de temporada manejás. De ahí sale el plan.'],
              ['Lo cargamos nosotros', 'Tus unidades, tus precios, tus mínimos, tus datos de transferencia y tus colores.'],
              ['Lo probás y lo publicás', 'Reservás vos mismo de punta a punta antes de que exista para nadie.'],
            ].map(([t, d], i) => (
              <li key={t} data-revelar style={{ transitionDelay: `${i * 80}ms` }}>
                <div className="h-full rounded-2xl p-5" style={tarjeta}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black" style={{ background: `${NOCHE.menta}18`, color: NOCHE.menta }}>
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-bold uppercase tracking-tight">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Seccion>

        <Seccion id="planes">
          <div data-revelar>
            <Rotulo>Precio</Rotulo>
            <Titulo acento="y sin comisión">Un número por mes,</Titulo>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANES.map((p) => (
              <div key={p.nombre} className="flex flex-col rounded-2xl p-5" style={p.destacado ? { background: `${NOCHE.menta}0f`, border: `1px solid ${NOCHE.menta}55` } : tarjeta}>
                <h3 className="text-lg font-black uppercase tracking-tight">{p.nombre}</h3>
                <p className="text-sm" style={{ color: NOCHE.textoTenue }}>{p.unidades}</p>
                <p className="mt-3 text-3xl font-black tabular-nums">
                  {p.desde && <span className="text-base font-bold">desde </span>}
                  {plata(p.mensual)}
                </p>
                <p className="text-sm" style={{ color: NOCHE.textoTenue }}>por mes · puesta a punto {plata(p.puestaAPunto)}</p>
                <p className="mt-3 flex-1 text-sm" style={{ color: NOCHE.textoSuave }}>{p.paraQuien}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm" style={{ color: NOCHE.textoSuave }}>
            Sin comisión por reserva y sin permanencia. Se contrata después de la charla: no hay pago online.
          </p>
        </Seccion>

        <Seccion hondo ancho="max-w-3xl">
          <div data-revelar>
            <Rotulo>Antes de consultar</Rotulo>
            <Titulo acento="conviene saber">Lo que</Titulo>
          </div>
          <div className="mt-10 space-y-3">
            {PREGUNTAS.map(([q, a]) => (
              <details key={q} className="rounded-xl px-5 py-4" style={tarjeta}>
                <summary className="cursor-pointer font-bold">{q}</summary>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>{a}</p>
              </details>
            ))}
          </div>
        </Seccion>

        <Seccion id="consulta" ancho="max-w-2xl">
          <div data-revelar>
            <Rotulo>Hablemos</Rotulo>
            <Titulo acento="y te escribimos">Dejanos tus datos</Titulo>
            <p className="mt-4 text-center" style={{ color: NOCHE.textoSuave }}>
              Te contesta una persona, no un bot. Somos dos, en Mar del Plata.
            </p>
          </div>
          <div className="mt-8">
            <FormularioConsulta />
          </div>
        </Seccion>
      </main>

      <footer className="px-5 py-8 text-xs" style={{ borderTop: `1px solid ${NOCHE.borde}`, color: NOCHE.textoTenue }}>
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3">
          <span>AlojaOS · un producto de SOVARE</span>
          <a href="/privacidad" className="underline underline-offset-2">Privacidad</a>
        </div>
      </footer>
    </div>
  );
}

/** Lo que frena una consulta: lo que el sistema no hace, y cómo se paga. */
const PREGUNTAS: [string, string][] = [
  ['¿Se conecta con Booking o con Airbnb?', 'Todavía no. Si vendés por esos canales, esas fechas las cerrás a mano en tu panel y nadie te las puede tomar por tu página.'],
  ['¿El huésped puede pagar con tarjeta?', 'No: la seña se transfiere a tu cuenta. Es la contracara de no cobrarte comisión: no pasa plata por nosotros.'],
  ['¿Qué pasa si alguien reserva y no transfiere?', 'Le guardás la unidad las horas que vos decidas. Si el plazo pasa, las noches se liberan solas.'],
  ['¿Y si no me llevo bien con la computadora?', 'Lo cargamos nosotros, y el día a día es una pantalla: las señas que esperan, con dos botones.'],
  ['¿Puedo usar mi propio dominio?', 'Sí. Por defecto tu página vive en tucomplejo.alojaos.shop, y si tenés tu dominio lo apuntamos ahí.'],
  ['¿Hay permanencia?', 'No. Te vas cuando quieras y te llevás tus datos.'],
];
