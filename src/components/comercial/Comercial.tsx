/**
 * La página comercial de AlojaOS.
 *
 * ==================================================================
 * A quién le habla
 * ==================================================================
 * A una persona que tiene entre 3 y 15 unidades y las atiende ella. No a un
 * hotel con recepción, ni a alguien que compara APIs. Eso decide el tono: sin
 * jerga —al dueño de cuatro cabañas no le vendés aislamiento de datos, le
 * vendés que nadie le tome la misma cabaña dos veces— y el problema nombrado
 * con las palabras con las que él lo cuenta.
 *
 * ==================================================================
 * Por qué se rehízo, y qué se copió
 * ==================================================================
 * La versión anterior era correcta y larga: trece secciones de texto claro
 * sobre fondo crema, con todo explicado. El problema de una página así no es
 * que mienta, es que no se lee. El que la abre desde un mensaje decide en diez
 * segundos, y en diez segundos no se lee un ensayo.
 *
 * Así que se rehízo con el molde de una página que ya vende bien, y lo que se
 * tomó de ella es la forma, no el contenido:
 *
 *   · **Fondo oscuro**, con dos tonos que se alternan sección por sección y
 *     una sola sección clara en el medio, que es la que corta el bloque.
 *   · **Títulos en itálica, versales y muy ajustados**, con la mitad de la
 *     frase en el color de acento. Es lo que le da carácter a la página, y es
 *     gratis: no es una ilustración que hay que encargar.
 *   · **Una idea por sección, dicha en una línea.** El texto largo que
 *     explicaba cada cosa se fue; lo que quedó de cada idea es el titular.
 *   · **Rótulo arriba de cada título**, chiquito y espaciado, que dice de qué
 *     trata la sección antes de leerla.
 *
 * Lo que NO se copió: los diez logos de clientes, los cuatro contadores de
 * «números reales» y el «más de X instituciones confían». De eso no tenemos
 * nada, y una página de venta con un número inventado se cae con una sola
 * pregunta. En su lugar va lo que sí tenemos y es más difícil de conseguir: un
 * complejo con nombre y dirección, y tres errores de auditoría contados con el
 * detalle de cuántos meses duraron.
 *
 * ==================================================================
 * Lo que esta página NO hace
 * ==================================================================
 * **No tiene testimonios ni números de resultados.** Ni «aumentá tus reservas
 * un 40 %» ni «ahorrá 10 horas por semana»: no los medimos. La calculadora, en
 * cambio, usa los números del que lee y calcula lo que deja de perder, que es
 * lo único sostenible. `npm run prueba:comercial` falla si alguna de esas tres
 * promesas vuelve a aparecer.
 *
 * Y las pantallas no son dibujos: son capturas del sistema andando, sacadas
 * por `npm run capturas`, con la fecha a la vista y el demo enlazado al lado.
 */

import { ENLACE_WHATSAPP, MAIL_CONTACTO } from '@/lib/constants';
import { MARCA, NOCHE } from '@/lib/marca-alojaos';
import { CASO, HALLAZGOS } from '@/lib/caso';
import { direccionDelComplejo } from '@/lib/tenant';
import {
  PLANES,
  MESES_QUE_SE_PAGAN_POR_ANIO,
  CUOTAS_DE_TEMPORADA,
  PISO_DE_LOS_SISTEMAS_GRANDES,
} from '@/lib/precios-alojaos';
import { Calculadora } from './Calculadora';
import { Captura, Marco, Telefono } from './Pantallas';
import { CAPTURAS, CAPTURAS_SACADAS_EL } from './capturas.generado';
import { Revelar } from './Revelar';
import { Video, DemoEmbebido } from './Video';
import { VIDEOS_GRABADOS_EL } from './videos.generado';
import { Check, Cruz, Flecha, Punto } from './Iconos';

const SECCIONES = [
  { id: 'problema', texto: 'El problema' },
  { id: 'producto', texto: 'El producto' },
  { id: 'caso', texto: 'El caso' },
  { id: 'cuenta', texto: 'La cuenta' },
  { id: 'precio', texto: 'Precio' },
];

/**
 * La dirección del demo, que es lo único de esta página que no se puede falsear.
 *
 * ------------------------------------------------------------------
 * Por qué NO sale de `CAPTURAS[...].de`
 * ------------------------------------------------------------------
 * Porque ahí estaba, y salió a producción apuntando a
 * `http://cabanias-del-sol.alojaos.test:3000` — mi máquina. El enlace existía,
 * el botón andaba, y el que lo tocaba no llegaba a ninguna parte. Es
 * exactamente el error que esta página ya tuvo una vez con el WhatsApp de
 * contacto, y volvió por otra puerta.
 *
 * La causa es confundir dos cosas que parecían una: `de` dice **de dónde salió
 * esa imagen** —y esa corrida fue local, porque las pantallas del panel
 * todavía no estaban en producción— y eso es documentación, no un enlace para
 * un visitante. La dirección del demo se arma como se arma la de cualquier
 * complejo, desde el dominio del sitio.
 */
const DEMO = direccionDelComplejo('cabanias-del-sol');

/** La fecha de las capturas, escrita como la lee alguien de acá. */
const DIA_DE_LAS_CAPTURAS = CAPTURAS_SACADAS_EL.split('-').reverse().join('/');

/** Y la de los videos, que se graban aparte. */
const DIA_DE_LOS_VIDEOS = VIDEOS_GRABADOS_EL.split('-').reverse().join('/');

export function Comercial() {
  return (
    <div
      // Las dos variables de tipografía son las mismas que usa la página de un
      // complejo; acá se las apunta a la del producto. Así los títulos y el
      // cuerpo cambian con el mecanismo que ya existe, sin una regla nueva.
      style={
        {
          background: NOCHE.fondo,
          color: NOCHE.texto,
          '--fuente-titulo': 'var(--font-aloja)',
          '--fuente-cuerpo': 'var(--font-aloja)',
        } as React.CSSProperties
      }
    >
      {/*
        El fondo oscuro tiene que llegar más allá de esta página.

        Sin esto, `body` se queda con el crema que fija `globals.css` para la
        página de un complejo, y eso se ve en dos lados: cuando en un teléfono
        estirás el scroll más allá del final —aparece una franja crema abajo de
        una página negra— y en la barra del navegador, que se pinta del color
        del documento.

        `color-scheme: dark` es la otra mitad y se nota en la calculadora: las
        perillas son controles del sistema operativo, y sin esto el navegador
        las dibuja en su versión clara, con la barra gris sobre el fondo
        oscuro. Decirle que el documento es oscuro las dibuja como corresponde.
      */}
      <style>{`html{color-scheme:dark}body{background:${NOCHE.fondo}}`}</style>

      {/* Esta línea tiene que correr ANTES de pintar: es la que habilita el
          estado escondido de las animaciones. Si no corriera —JavaScript
          apagado, un error de red— nada se esconde y la página se ve entera,
          que es exactamente lo que tiene que pasar. */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('con-js')" }} />
      <Revelar />

      <Navegacion />
      <Hero />
      <Cinta />
      <ElProblema />
      <AntesYDespues />
      <ComoEmpezas />
      <ElPanel />
      <LaPaginaDelHuesped />
      <ElDemo />
      <LaRegla />
      <ElCaso />
      <LaCuenta />
      <Precio />
      <Preguntas />
      <CierreFinal />
      <Pie />
    </div>
  );
}

/* ==================================================================
   Las piezas que se repiten
   ================================================================== */

/**
 * El rótulo de arriba de cada título.
 *
 * Chiquito, en versales y muy espaciado. Hace un trabajo concreto: el que
 * scrollea rápido lee esto y sabe de qué trata la sección sin leer el título.
 */
function Rotulo({ children, centrado = false }: { children: React.ReactNode; centrado?: boolean }) {
  return (
    <p
      className={`text-[11px] font-bold uppercase tracking-[0.28em] ${centrado ? 'text-center' : ''}`}
      style={{ color: NOCHE.menta }}
    >
      {children}
    </p>
  );
}

/**
 * El título de una sección.
 *
 * Itálica, versales, peso máximo y el espaciado muy cerrado. La parte en
 * `acento` va en terracota: parte la frase en dos y le da el único punto de
 * color de la sección.
 *
 * La itálica es sintética —la tipografía no trae cursiva— y eso acá juega a
 * favor: la inclinación es pareja y da el aire de titular deportivo que se
 * busca.
 */
function Titulo({
  children,
  acento,
  centrado = false,
  como = 'h2',
}: {
  children: React.ReactNode;
  acento?: React.ReactNode;
  centrado?: boolean;
  como?: 'h1' | 'h2';
}) {
  const Tag = como;
  return (
    <Tag
      className={[
        'font-black italic uppercase tracking-[-0.03em]',
        como === 'h1'
          // Más chico que el del molde (60 px) porque el titular de acá tiene
          // el doble de palabras: a 65 px eran cinco renglones, y un titular de
          // cinco renglones deja de leerse como un titular.
          ? 'text-[2.3rem] leading-[0.98] sm:text-5xl lg:text-[3.35rem]'
          : 'text-[1.9rem] leading-[1.02] sm:text-4xl lg:text-5xl',
        centrado ? 'text-center' : '',
      ].join(' ')}
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

/** Un párrafo de los que acompañan a un título. */
function Bajada({
  children,
  centrado = false,
  className = '',
}: {
  children: React.ReactNode;
  centrado?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`leading-relaxed ${centrado ? 'mx-auto text-center' : ''} ${className}`}
      style={{ color: NOCHE.textoSuave }}
    >
      {children}
    </p>
  );
}

/** Una tarjeta sobre el fondo oscuro. */
function Tarjeta({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{ background: NOCHE.tarjeta, border: `1px solid ${NOCHE.borde}` }}
    >
      {children}
    </div>
  );
}

/** Una fila de las listas de capacidades, con su tilde. */
function Fila({ children }: { children: React.ReactNode }) {
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium"
      style={{ background: NOCHE.tarjeta, border: `1px solid ${NOCHE.borde}` }}
    >
      <Check color={NOCHE.menta} />
      {children}
    </li>
  );
}

/** El botón principal: el único terracota de la pantalla. */
function BotonPrincipal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener' : undefined}
      className="group inline-flex items-center gap-2.5 rounded-xl px-6 py-3.5 text-[15px] font-bold text-white transition hover:brightness-110"
      style={{ background: NOCHE.accion }}
    >
      {children}
      <Flecha />
    </a>
  );
}

/** El secundario: mismo tamaño, sin relleno, para no competir con el otro. */
function BotonSecundario({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-bold transition hover:bg-white/5"
      style={{ border: `1px solid ${NOCHE.borde}`, color: NOCHE.texto }}
    >
      {children}
    </a>
  );
}

/** Una sección, con su fondo y su aire. */
function Seccion({
  id,
  hondo = false,
  children,
  className = '',
}: {
  id?: string;
  hondo?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 px-6 py-20 md:py-28 ${className}`}
      style={{
        background: hondo ? NOCHE.fondoHondo : NOCHE.fondo,
        borderTop: `1px solid ${NOCHE.borde}`,
      }}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/* ==================================================================
   Las secciones
   ================================================================== */

function Navegacion() {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur"
      style={{ background: 'rgba(6,25,27,.82)', borderBottom: `1px solid ${NOCHE.borde}` }}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
        {/* El logo NO va en versales: «AlojaOS» tiene la O y la S altas a
            propósito —es un «OS», como el de un sistema operativo— y en
            versales eso se pierde. */}
        <a href="#" className="text-lg font-black italic tracking-tight">
          AlojaOS
        </a>
        {/* Los enlaces se esconden en el celular: cinco enlaces apretados en
            360 píxeles no los toca nadie, y el que entra desde un mensaje
            scrollea. */}
        <ul className="hidden gap-7 text-[13px] font-semibold uppercase tracking-wider md:flex">
          {SECCIONES.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="transition hover:text-white" style={{ color: NOCHE.textoSuave }}>
                {s.texto}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4">
          <a
            href="/login"
            className="hidden text-[13px] font-semibold transition hover:text-white sm:block"
            style={{ color: NOCHE.textoSuave }}
          >
            Entrar
          </a>
          <a
            href={ENLACE_WHATSAPP}
            target="_blank"
            rel="noopener"
            className="rounded-xl px-4 py-2 text-[13px] font-bold text-white transition hover:brightness-110"
            style={{ background: NOCHE.accion }}
          >
            Escribinos
          </a>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-14 md:pb-24 md:pt-20">
      {/* El resplandor. Es un solo degradado y no una imagen: pesa cero, se
          adapta a cualquier pantalla y no hay que acordarse de optimizarlo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(60rem 32rem at 68% 18%, rgba(111,214,174,.09), transparent 60%),
                       radial-gradient(44rem 26rem at 8% 0%, rgba(177,78,43,.12), transparent 62%)`,
        }}
      />

      {/* El hero NO aparece al scrollear, y es a propósito: lo que se esconde
          se revela recién cuando React hidrata, así que marcarlo acá sería
          mostrar una pantalla vacía durante los primeros cuadros. Lo primero
          que se ve tiene que estar desde el primer pintado. */}
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ border: `1px solid ${NOCHE.menta}44`, color: NOCHE.menta, background: `${NOCHE.menta}10` }}
          >
            <Punto color={NOCHE.menta} />
            Para complejos de 3 a 15 unidades
          </span>

          <div className="mt-6">
            <Titulo como="h1" acento="dos veces la misma noche">
              Tus cabañas se reservan solas. Y nunca
            </Titulo>
          </div>

          <p className="mt-6 max-w-xl text-lg font-semibold leading-snug">
            Tu propia página de reservas, con tu nombre y tus colores.
          </p>
          <Bajada className="mt-3 max-w-xl">
            El huésped elige las noches, ve el precio, transfiere la seña y sube
            el comprobante. Vos confirmás desde el teléfono.
          </Bajada>

          <div className="mt-8 flex flex-wrap gap-3">
            <BotonPrincipal href={ENLACE_WHATSAPP}>Hablemos por WhatsApp</BotonPrincipal>
            <BotonSecundario href="#producto">Ver el producto</BotonSecundario>
          </div>

          {/* Las tres cosas que esta persona pregunta antes de nada. */}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-semibold">
            {['Sin comisión por reserva', 'La seña va a tu cuenta', 'Se usa del celular'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check color={NOCHE.menta} />
                {t}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-sm" style={{ color: NOCHE.textoTenue }}>
            El sistema con el que {CASO.nombre}, en {CASO.localidad}, toma sus reservas.
          </p>
        </div>

        <div className="lg:pl-6">
          <Telefono>
            <Captura cual="huesped-eligiendo" prioridad sizes="(max-width: 1024px) 80vw, 300px" />
          </Telefono>
          <p className="mt-4 text-center text-xs" style={{ color: NOCHE.textoTenue }}>
            Captura del {DIA_DE_LAS_CAPTURAS}.{' '}
            <a className="underline transition hover:text-white" href={DEMO} target="_blank" rel="noopener">
              Abrí el demo y comparalo
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * La cinta, con la frase que resume por qué alguien contrata esto.
 *
 * Se mueve sola y en loop. Es la única animación que corre sin que nadie
 * scrollee, y está acá porque una página que se mueve apenas carga se siente
 * viva; con `prefers-reduced-motion` se queda quieta.
 */
function Cinta() {
  const frase = 'Nadie contrata un sistema de reservas. Contrata dejar de perder noches.';
  return (
    <div
      className="overflow-hidden py-5"
      style={{ background: NOCHE.fondoHondo, borderTop: `1px solid ${NOCHE.borde}`, borderBottom: `1px solid ${NOCHE.borde}` }}
    >
      {/* El contenido va dos veces: cuando el desplazamiento llega al 50 %, el
          segundo juego está donde arrancó el primero y el ciclo no se nota.

          Y las ocho copias están `aria-hidden`: para quien usa un lector de
          pantalla, una cinta que repite la misma frase ocho veces es ocho veces
          la misma frase. La frase se dice una sola vez, abajo, donde ninguna
          pantalla la muestra pero todo lector la lee. */}
      <p className="sr-only">{frase}</p>
      <div className="cinta flex w-max gap-10 whitespace-nowrap" aria-hidden>
        {[0, 1].map((juego) => (
          <div key={juego} className="flex gap-10">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="flex items-center gap-10 text-sm font-bold uppercase tracking-[0.18em]"
                style={{ color: NOCHE.textoTenue }}
              >
                {frase}
                <Punto color={NOCHE.accionViva} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ElProblema() {
  const preguntas = [
    '¿Te escribieron por una fecha que ya habías dado?',
    '¿Tenés fechas bloqueadas y no te acordás por qué?',
    '¿Contestás «¿está libre?» y «¿cuánto sale?» todo el día?',
    '¿Alguien reservó, no transfirió, y las noches quedaron tomadas?',
    '¿Cada cambio de precio se lo tenés que pedir a alguien?',
    '¿Tenés el calendario en un cuaderno y en la cabeza?',
  ];

  return (
    <Seccion id="problema">
      <div data-revelar>
        <Rotulo centrado>¿Te suena?</Rotulo>
        <div className="mt-4">
          <Titulo centrado acento="esto es para vos">
            Si contestaste que sí,
          </Titulo>
        </div>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {preguntas.map((p, i) => (
          <div key={p} data-revelar style={{ transitionDelay: `${i * 60}ms` }}>
            <Tarjeta className="flex items-start gap-3.5">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(209,90,66,.14)' }}
              >
                <Cruz color="#e0836a" />
              </span>
              <span className="text-[15px] leading-relaxed" style={{ color: NOCHE.textoSuave }}>
                {p}
              </span>
            </Tarjeta>
          </div>
        ))}
      </div>
    </Seccion>
  );
}

/**
 * El antes y el después, y la única sección clara de la página.
 *
 * El corte de color hace dos cosas: descansa la vista en el medio del scroll, y
 * marca que acá hay un cambio de estado. Es el mismo recurso que usa el molde.
 */
function AntesYDespues() {
  const antes = [
    'El calendario en un cuaderno',
    'Comprobantes por WhatsApp',
    'Contestar precios a mano',
    'Fechas tomadas por señas que no llegaron',
    'Cambiar un precio es pedírselo a alguien',
  ];
  const despues = [
    'El calendario lo lleva la base',
    'El comprobante entra con la reserva',
    'El precio está en la página',
    'Las noches se liberan solas al vencer',
    'Los precios los cargás vos, cuando quieras',
  ];

  return (
    <section
      className="px-6 py-20 md:py-28"
      style={{ background: MARCA.crema, color: MARCA.texto }}
    >
      <div className="mx-auto max-w-6xl">
        <div data-revelar>
          <p
            className="text-center text-[11px] font-bold uppercase tracking-[0.28em]"
            style={{ color: MARCA.acentoHondo }}
          >
            El cambio
          </p>
          <h2 className="mt-4 text-center text-[1.9rem] font-black italic uppercase leading-[1.02] tracking-[-0.03em] sm:text-4xl lg:text-5xl">
            Lo mismo, pero{' '}
            <span style={{ color: MARCA.acento }}>sin vos en el medio</span>
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div data-revelar>
            <div
              className="h-full rounded-2xl p-6"
              style={{ background: 'white', border: `1px solid rgba(0,0,0,.08)` }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: MARCA.textoSuave }}>
                Hoy
              </p>
              <ul className="mt-5 space-y-3.5">
                {antes.map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[15px]" style={{ color: MARCA.textoSuave }}>
                    <Cruz color="#c0563c" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div data-revelar style={{ transitionDelay: '120ms' }}>
            <div
              className="h-full rounded-2xl p-6"
              style={{ background: 'white', border: `1px solid ${MARCA.tinta}33`, boxShadow: '0 12px 40px rgba(13,59,62,.10)' }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: MARCA.tinta }}>
                Con AlojaOS
              </p>
              <ul className="mt-5 space-y-3.5">
                {despues.map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[15px] font-semibold">
                    <Check color={MARCA.tinta} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComoEmpezas() {
  const pasos = [
    {
      titulo: 'Una charla de veinte minutos',
      texto: 'Cuántas unidades tenés, cómo cobrás y qué reglas de temporada manejás. De ahí sale el número.',
    },
    {
      titulo: 'Lo cargamos nosotros',
      texto: 'Tus unidades, tus precios, tus mínimos, tus datos de transferencia y tus colores. No arrancás con un formulario vacío.',
    },
    {
      titulo: 'Lo probás y lo publicás',
      texto: 'Reservás vos mismo de punta a punta antes de que exista para nadie. Si algo está mal, se cambia ahí.',
    },
  ];

  return (
    <Seccion hondo>
      <div data-revelar>
        <Rotulo centrado>Cómo arrancamos</Rotulo>
        <div className="mt-4">
          <Titulo centrado acento="andando">
            De la primera charla a tu página
          </Titulo>
        </div>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {pasos.map((p, i) => (
          <div key={p.titulo} data-revelar style={{ transitionDelay: `${i * 90}ms` }}>
            <Tarjeta className="h-full">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black"
                  style={{ background: `${NOCHE.menta}18`, color: NOCHE.menta }}
                >
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-[17px] font-bold uppercase tracking-tight">{p.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>
                {p.texto}
              </p>
            </Tarjeta>
          </div>
        ))}
      </div>
    </Seccion>
  );
}

function ElPanel() {
  return (
    <Seccion id="producto">
      <div className="grid items-center gap-12 lg:grid-cols-[.92fr_1.08fr]">
        <div data-revelar>
          <Rotulo>Para vos</Rotulo>
          <div className="mt-4">
            <Titulo acento="en una pantalla">Todo tu complejo,</Titulo>
          </div>
          <Bajada className="mt-5 max-w-lg">
            Las señas que esperan, con su comprobante y su plazo. Dos botones:
            confirmar y rechazar. Lo demás —precios, fechas cerradas, tus datos,
            tus colores— lo tocás cuando querés.
          </Bajada>

          <ul className="mt-7 space-y-2.5">
            {[
              'Confirmar o rechazar una seña',
              'Precios por temporada',
              'Cerrar fechas, con el motivo escrito',
              'Mínimos de noches y días de entrada',
              'Tus colores y tu tipografía',
            ].map((t) => (
              <Fila key={t}>{t}</Fila>
            ))}
          </ul>
        </div>

        <div className="space-y-5" data-revelar style={{ transitionDelay: '120ms' }}>
          <Marco>
            <Captura cual="panel-senas" sizes="(max-width: 1024px) 90vw, 600px" />
          </Marco>
          <Marco>
            <Captura cual="panel-precios" sizes="(max-width: 1024px) 90vw, 600px" />
          </Marco>
          <p className="text-sm leading-relaxed" style={{ color: NOCHE.textoTenue }}>
            El aviso rojo de la segunda es el sistema contando las noches que
            quedarían sin precio. Una unidad sin tarifa se muestra libre igual, y
            el que no pudo reservar no escribe para avisarte: se va.
          </p>
        </div>
      </div>
    </Seccion>
  );
}

function LaPaginaDelHuesped() {
  return (
    <Seccion hondo>
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr]">
        <div className="order-2 lg:order-1" data-revelar>
          {/* Acá iba una captura de la pantalla de transferir. Un video del
              recorrido entero —elegir, ver el precio, dejar los datos,
              reservar— dice en ocho segundos lo que la captura decía de una
              sola pantalla. */}
          <Telefono>
            <Video cual="reservar" />
          </Telefono>
          <p className="mt-4 text-center text-xs" style={{ color: NOCHE.textoTenue }}>
            Grabado el {DIA_DE_LOS_VIDEOS} contra el sistema andando, sin cortes.
          </p>
        </div>

        <div className="order-1 lg:order-2" data-revelar style={{ transitionDelay: '100ms' }}>
          <Rotulo>Para tu huésped</Rotulo>
          <div className="mt-4">
            <Titulo acento="a las tres de la mañana">Que pueda reservar</Titulo>
          </div>
          <Bajada className="mt-5 max-w-lg">
            Ve qué está libre, cuánto sale, cuánto es la seña y a dónde
            transferir. Sube la foto del comprobante desde el celular y la
            pantalla le confirma que el sistema la tiene.
          </Bajada>

          <ul className="mt-7 space-y-2.5">
            {[
              'El calendario sabe qué está tomado',
              'El precio, antes de dejar los datos',
              'Tu alias y tu CBU, con el plazo de la seña',
              'El comprobante, desde el teléfono',
            ].map((t) => (
              <Fila key={t}>{t}</Fila>
            ))}
          </ul>

          <p className="mt-6 text-sm" style={{ color: NOCHE.textoTenue }}>
            Capturas del {DIA_DE_LAS_CAPTURAS}.{' '}
            <a className="underline transition hover:text-white" href={DEMO} target="_blank" rel="noopener">
              El demo está abierto
            </a>
            : reservá vos mismo.
          </p>
        </div>
      </div>
    </Seccion>
  );
}

/**
 * El demo, adentro de la página.
 *
 * Es lo único de toda la página que no hay que creer: no es una captura, ni un
 * video, ni una promesa. Es el sistema, con su base del otro lado, corriendo
 * adentro de un marco. Se puede elegir fechas y reservar desde acá.
 *
 * Por eso va después de las dos secciones de producto y antes de la regla: el
 * que llegó hasta acá ya vio qué hace y ahora puede comprobarlo, que es
 * exactamente el momento en que una página de venta deja de tener que
 * convencer.
 */
function ElDemo() {
  return (
    <Seccion>
      <div className="mx-auto max-w-4xl">
        <div data-revelar>
          <Rotulo centrado>Sin registrarte ni dejar un mail</Rotulo>
          <div className="mt-4">
            <Titulo centrado acento="probalo acá mismo">
              No hace falta que nos creas:
            </Titulo>
          </div>
          <Bajada centrado className="mt-5 max-w-2xl">
            Es un complejo de ejemplo con sus cuatro cabañas y sus precios
            cargados. Lo que ves es el sistema, no una maqueta: elegí unas
            noches y reservá.
          </Bajada>
        </div>

        <div className="mt-10" data-revelar>
          <div
            className="mx-auto w-full max-w-[380px] overflow-hidden rounded-[2rem] p-2.5"
            style={{ background: '#0b2a2c', border: `1px solid ${NOCHE.borde}`, boxShadow: '0 26px 60px rgba(0,0,0,.45)' }}
          >
            <div className="overflow-hidden rounded-[1.5rem] bg-white">
              <DemoEmbebido direccion={DEMO} />
            </div>
          </div>
          <p className="mt-5 text-center text-sm" style={{ color: NOCHE.textoTenue }}>
            ¿Preferís verlo en grande?{' '}
            <a className="underline transition hover:text-white" href={DEMO} target="_blank" rel="noopener">
              Abrilo en otra pestaña
            </a>
            .
          </p>
        </div>
      </div>
    </Seccion>
  );
}

/**
 * La regla, sola, en una franja de acento.
 *
 * Es lo único que ningún competidor de este tamaño puede prometer de verdad, y
 * es el miedo concreto del que lee: que dos familias lleguen el mismo día a la
 * misma cabaña. Va en una franja de color y con una sola frase porque mezclada
 * entre otras diez ventajas se pierde.
 */
function LaRegla() {
  return (
    <section className="px-6 py-20 md:py-24" style={{ background: NOCHE.accion }}>
      <div className="mx-auto max-w-4xl text-center" data-revelar>
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/70">
          La regla que no se puede romper
        </p>
        <h2 className="mt-5 text-[1.9rem] font-black italic uppercase leading-[1.02] tracking-[-0.03em] text-white sm:text-4xl lg:text-5xl">
          Nunca dos reservas sobre la misma unidad y la misma noche
        </h2>
        <p className="mx-auto mt-6 max-w-2xl leading-relaxed text-white/85">
          No lo garantiza un cartel ni una revisión antes de guardar: lo
          garantiza la base de datos, con una restricción. Dos personas que
          aprietan «reservar» en el mismo segundo no pueden pasar las dos,
          aunque el sistema esté saturado.
        </p>
      </div>
    </section>
  );
}

function ElCaso() {
  return (
    <Seccion id="caso">
      <div className="mx-auto max-w-3xl">
        <div data-revelar>
          <Rotulo>El complejo del que salió</Rotulo>
          <div className="mt-4">
            <Titulo acento="con este sistema">{CASO.nombre} toma sus reservas</Titulo>
          </div>
          <Bajada className="mt-5">
            {CASO.unidades} cabañas en {CASO.localidad}, {CASO.provincia}, atendidas
            por sus dueños. AlojaOS es ese sistema: el mismo que viene andando
            ahí, auditado entero y vuelto a escribir para que lo pueda usar
            cualquier complejo de 3 a 15 unidades.
          </Bajada>

          <ul className="mt-7 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {CASO.queHace.map((q) => (
              <li key={q} className="flex items-start gap-3 text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>
                <Check color={NOCHE.menta} />
                {q}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-16" data-revelar>
          <Rotulo>La auditoría</Rotulo>
          <h3 className="mt-4 text-2xl font-black italic uppercase tracking-[-0.03em] sm:text-3xl">
            Tres errores que encontramos, y cómo quedaron
          </h3>
          <Bajada className="mt-4">
            Contarlos es más útil que decir que el sistema es excelente —sobre
            todo para alguien a quien ya le prometieron uno excelente—.
          </Bajada>
        </div>

        <ul className="mt-9 space-y-4">
          {HALLAZGOS.map((h, i) => (
            <li key={h.titulo} data-revelar style={{ transitionDelay: `${i * 80}ms` }}>
              <Tarjeta>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h4 className="font-bold">{h.titulo}</h4>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ background: 'rgba(209,90,66,.16)', color: '#e0836a' }}
                  >
                    {h.cuanto}
                  </span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>
                  {h.texto}
                </p>
                <p className="mt-3 text-sm leading-relaxed">
                  <strong style={{ color: NOCHE.menta }}>Cómo quedó:</strong>{' '}
                  <span style={{ color: NOCHE.textoSuave }}>{h.comoSeArreglo}</span>
                </p>
              </Tarjeta>
            </li>
          ))}
        </ul>

        <div className="mt-8" data-revelar>
          <Tarjeta>
            <p className="text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>
              Los tres tienen la misma forma:{' '}
              <strong style={{ color: NOCHE.texto }}>algo contestaba que estaba bien sin estarlo.</strong>{' '}
              Ninguno tiraba un error y los tres duraron meses, porque la única
              forma de notarlos era que alguien fuera a buscar. Esa clase de
              falla no se arregla revisando mejor: se arregla haciendo que la
              operación no pueda decir que hizo algo sin haberlo hecho.
            </p>
          </Tarjeta>
        </div>
      </div>
    </Seccion>
  );
}

function LaCuenta() {
  return (
    <Seccion id="cuenta" hondo>
      <div data-revelar>
        <Rotulo centrado>La cuenta</Rotulo>
        <div className="mt-4">
          <Titulo centrado acento="que no pudiste vender?">¿Cuánto te cuesta una noche</Titulo>
        </div>
        <Bajada centrado className="mt-5 max-w-2xl">
          Movelo con tus números. No te pedimos el mail para ver el resultado.
        </Bajada>
      </div>
      <div className="mt-12" data-revelar>
        <Calculadora />
      </div>
    </Seccion>
  );
}

function Precio() {
  const anual = PLANES.map((p) => ({
    ...p,
    porTemporada: Math.round((p.mensual * MESES_QUE_SE_PAGAN_POR_ANIO) / CUOTAS_DE_TEMPORADA),
  }));
  const plata = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

  return (
    <Seccion id="precio">
      <div data-revelar>
        <Rotulo centrado>Precio</Rotulo>
        <div className="mt-4">
          <Titulo centrado acento="y sin comisión">Un número por mes,</Titulo>
        </div>
        <Bajada centrado className="mt-5 max-w-2xl">
          Pagás {MESES_QUE_SE_PAGAN_POR_ANIO} meses al año: los dos de temporada
          baja van sin cargo. Y si preferís, los {MESES_QUE_SE_PAGAN_POR_ANIO}{' '}
          se juntan en {CUOTAS_DE_TEMPORADA} cuotas de temporada.
        </Bajada>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {anual.map((p, i) => (
          <div key={p.nombre} data-revelar style={{ transitionDelay: `${i * 70}ms` }}>
            <div
              className="flex h-full flex-col rounded-2xl p-6"
              style={{
                background: p.destacado ? `${NOCHE.menta}0f` : NOCHE.tarjeta,
                border: `1px solid ${p.destacado ? `${NOCHE.menta}55` : NOCHE.borde}`,
              }}
            >
              {/* El hueco de la cinta existe en las cuatro tarjetas, tenga o
                  no cinta: si sólo lo tuviera la destacada, esa tarjeta
                  empujaría su contenido y los cuatro precios quedarían a
                  cuatro alturas distintas. Lo mismo con el alto mínimo de la
                  línea de unidades, que en un plan ocupa dos renglones. */}
              <div className="mb-3 h-[22px]">
                {p.destacado && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ background: `${NOCHE.menta}1f`, color: NOCHE.menta }}
                  >
                    El más elegido
                  </span>
                )}
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight">{p.nombre}</h3>
              <p className="mt-1 min-h-[2.75rem] text-sm leading-snug" style={{ color: NOCHE.textoTenue }}>
                {p.unidades}
              </p>

              <p className="mt-3 text-3xl font-black tracking-tight tabular-nums">
                {p.desde && <span className="text-lg font-bold">desde </span>}
                {plata(p.mensual)}
              </p>
              <p className="text-sm" style={{ color: NOCHE.textoTenue }}>
                por mes
              </p>

              <p className="mt-3 text-sm" style={{ color: NOCHE.textoSuave }}>
                o {plata(p.porTemporada)} × {CUOTAS_DE_TEMPORADA} cuotas
              </p>
              <p className="mt-1 text-sm" style={{ color: NOCHE.textoTenue }}>
                Puesta a punto: {plata(p.puestaAPunto)} (una vez)
              </p>

              <p className="mt-5 flex-1 text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>
                {p.paraQuien}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8" data-revelar>
        <Tarjeta>
          <p className="text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>
            Para comparar: el piso de los sistemas grandes de hotelería arranca
            en {plata(PISO_DE_LOS_SISTEMAS_GRANDES)} por mes más IVA, sólo la
            parte de administración. Y los portales cobran entre 15 % y 18 % de
            cada reserva.{' '}
            <strong style={{ color: NOCHE.texto }}>Acá no hay comisión por reserva, vendas mucho o poco.</strong>{' '}
            Sin permanencia: te vas cuando quieras y te llevás tus datos.
          </p>
        </Tarjeta>
      </div>
    </Seccion>
  );
}

function Preguntas() {
  const preguntas = [
    {
      q: '¿Y si no me llevo bien con la computadora?',
      a: 'Lo cargamos nosotros y el día a día es una sola pantalla: la lista de señas que esperan, con dos botones. Cambiar un precio o cerrar una semana son dos pantallas más, y si preferís que lo hagamos nosotros, nos escribís.',
    },
    {
      q: '¿Qué pasa si alguien reserva y no transfiere?',
      a: 'Le guardás la unidad las horas que vos decidas. Si el plazo pasa, las noches se liberan solas y vuelven a estar a la venta. No tenés que revisar nada.',
    },
    {
      q: '¿Se conecta con Booking o con Airbnb?',
      a: 'Todavía no. Si vendés por esos canales, esas fechas las cerrás a mano en tu panel y nadie te las puede tomar por la página. Es lo primero que vamos a construir si varios lo piden.',
    },
    {
      q: '¿El huésped puede pagar con tarjeta?',
      a: 'No: la seña se transfiere a tu cuenta. Es la contracara de no cobrarte comisión — no pasa plata por nosotros, así que no hay nada que retenerte ni que demorarte.',
    },
    {
      q: '¿Qué pasa con los datos de mis huéspedes?',
      a: 'Son tuyos y están aislados: ningún otro complejo los ve, y el visitante de tu página no ve quién ocupa una fecha, sólo que está ocupada. Si te vas, te los llevás.',
    },
    {
      q: '¿Cómo sé que esto no se va a caer el fin de semana largo?',
      a: 'Es la pregunta correcta. Cada cambio pasa por una batería de pruebas que incluye dos reservas simultáneas sobre la misma noche, y se corre contra la base de verdad. Y el panel te avisa si algo del sistema dejó de funcionar, en vez de esperar que lo notes.',
    },
    {
      q: '¿Puedo usar mi propio dominio?',
      a: 'Sí. Por defecto tu página vive en tucomplejo.alojaos.shop, y si tenés tu dominio lo apuntamos ahí.',
    },
  ];

  return (
    <Seccion id="preguntas" hondo>
      <div className="mx-auto max-w-3xl">
        <div data-revelar>
          <Rotulo centrado>Preguntas</Rotulo>
          <div className="mt-4">
            <Titulo centrado acento="preguntan">Lo que nos</Titulo>
          </div>
        </div>

        <dl className="mt-12 space-y-3">
          {preguntas.map((p, i) => (
            <div key={p.q} data-revelar style={{ transitionDelay: `${Math.min(i, 4) * 50}ms` }}>
              <Tarjeta>
                <dt className="font-bold">{p.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed" style={{ color: NOCHE.textoSuave }}>
                  {p.a}
                </dd>
              </Tarjeta>
            </div>
          ))}
        </dl>
      </div>
    </Seccion>
  );
}

function CierreFinal() {
  return (
    <section className="relative overflow-hidden px-6 py-24 md:py-32" style={{ background: NOCHE.fondoHondo }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(44rem 24rem at 50% 0%, rgba(177,78,43,.16), transparent 65%)`,
        }}
      />
      <div className="relative mx-auto max-w-3xl text-center" data-revelar>
        <Titulo centrado acento="de nadie">Que la próxima noche no se trabe por una seña</Titulo>
        <Bajada centrado className="mt-6 max-w-xl">
          Escribinos y te armamos tu página con tus unidades y tus precios
          cargados, para que la pruebes antes de que exista para nadie.
        </Bajada>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <BotonPrincipal href={ENLACE_WHATSAPP}>Hablemos por WhatsApp</BotonPrincipal>
          <BotonSecundario href={`mailto:${MAIL_CONTACTO}`}>{MAIL_CONTACTO}</BotonSecundario>
        </div>
        <p className="mt-6 text-sm" style={{ color: NOCHE.textoTenue }}>
          Somos dos personas en Mar del Plata. Te contestamos nosotros, no un ticket.
        </p>
      </div>
    </section>
  );
}

function Pie() {
  return (
    <footer className="px-6 py-12" style={{ background: NOCHE.fondo, borderTop: `1px solid ${NOCHE.borde}` }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-lg font-black italic tracking-tight">AlojaOS</p>
          <p className="mt-1 text-sm" style={{ color: NOCHE.textoTenue }}>
            Reservas para complejos chicos. Hecho en Mar del Plata.
          </p>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <a className="transition hover:text-white" style={{ color: NOCHE.textoSuave }} href={ENLACE_WHATSAPP} target="_blank" rel="noopener">
            WhatsApp
          </a>
          <a className="transition hover:text-white" style={{ color: NOCHE.textoSuave }} href={`mailto:${MAIL_CONTACTO}`}>
            {MAIL_CONTACTO}
          </a>
          <a className="transition hover:text-white" style={{ color: NOCHE.textoSuave }} href="/login">
            Entrar
          </a>
        </div>
      </div>
    </footer>
  );
}
