/**
 * La página comercial de AlojaOS.
 *
 * ------------------------------------------------------------------
 * A quién le habla
 * ------------------------------------------------------------------
 * A una persona que tiene entre 3 y 15 unidades y las atiende ella. No a un
 * hotel con recepción, ni a alguien que compara APIs. Eso decide todo lo demás:
 *
 *   - no hay jerga. Ni «multi-tenant», ni «stack», ni «RLS». Al dueño de cuatro
 *     cabañas no le vendés aislamiento de datos, le vendés que nadie le tome la
 *     misma cabaña dos veces;
 *   - el problema se nombra antes de la solución, y con las palabras con las que
 *     él lo cuenta: «me reservaron dos veces la misma», «no sé quién transfirió»;
 *   - no hay precio inventado. Decir «desde $X» y después negociar otra cosa es
 *     la primera mentira de la relación. Dice que se conversa, porque se
 *     conversa;
 *   - no hay formulario de 9 campos. El contacto es WhatsApp, que es por donde
 *     esta persona atiende su negocio.
 *
 * ------------------------------------------------------------------
 * Lo que NO dice
 * ------------------------------------------------------------------
 * No promete lo que todavía no está: mails automáticos, pasarela de pago,
 * reportes. Están en la lista de lo que falta, no en la página. Una página
 * comercial que promete una función que no existe la cobra igual, y después
 * alguien tiene que explicarla.
 */

import { ENLACE_WHATSAPP, MAIL_CONTACTO } from '@/lib/constants';

export function Comercial() {
  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1b2b26]">
      <header className="px-6 pt-20 pb-10 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest opacity-50">AlojaOS</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
            Tus cabañas se reservan solas, y nunca dos veces la misma noche.
          </h1>
          <p className="mt-5 max-w-prose text-lg opacity-80">
            Una página de reservas con tu nombre y tus colores, donde el huésped
            elige las noches, ve el precio, deja la seña y sube el comprobante.
            Vos lo confirmás desde el teléfono.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={ENLACE_WHATSAPP}
              target="_blank"
              rel="noopener"
              className="rounded-2xl bg-[#2f5d50] px-6 py-3 font-semibold text-white"
            >
              Escribinos por WhatsApp
            </a>
            <a
              href="/login"
              className="rounded-2xl border border-black/15 px-6 py-3 font-semibold"
            >
              Ya soy cliente
            </a>
          </div>
        </div>
      </header>

      <section className="border-y border-black/10 bg-white/50 px-6 py-14 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">Si esto te pasó, es para vos</h2>
          <ul className="mt-6 space-y-5">
            <Problema titulo="«Me reservaron dos veces la misma cabaña»">
              No puede pasar. La regla no está en la página ni en una
              planilla: está en la base de datos, que rechaza la segunda reserva
              aunque las dos lleguen en el mismo segundo. Es la única parte de
              este sistema que no depende de que nadie se acuerde de algo.
            </Problema>
            <Problema titulo="«No sé quién transfirió y quién no»">
              Cada seña tiene su plazo. El huésped sube el comprobante y lo ve
              confirmado en su pantalla; vos lo abrís desde el panel. Si el plazo
              pasa sin transferencia, las noches se liberan solas —no cuando
              alguien se acuerda de revisar—.
            </Problema>
            <Problema titulo="«Cada vez que cambio un precio tengo que avisarle a alguien»">
              Los precios, los mínimos de noches y los días de entrada son datos
              tuyos, no código. Temporada alta con mínimo de 7 noches entrando
              sábado o domingo se carga una vez y la página la respeta.
            </Problema>
            <Problema titulo="«La página dice una cosa y la realidad es otra»">
              Una estadía que cruza de temporada se cobra cada noche según su
              fecha, y la pantalla lo explica en vez de mostrar un número raro.
              Si una unidad no tiene tarifa cargada, lo dice: no inventa un
              precio.
            </Problema>
          </ul>
        </div>
      </section>

      <section className="px-6 py-14 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">Cómo funciona</h2>
          <ol className="mt-6 space-y-4">
            <Paso n={1} titulo="Tu página">
              <code>tucomplejo.alojaos.shop</code>, con tu nombre, tus colores y
              tus unidades. Se la mandás por WhatsApp o la ponés en tu Instagram.
            </Paso>
            <Paso n={2} titulo="El huésped reserva">
              Elige unidad y noches sobre un calendario que ya sabe qué está
              ocupado. Ve el total y la seña antes de dejar sus datos.
            </Paso>
            <Paso n={3} titulo="Transfiere y sube el comprobante">
              Le mostramos tu alias y tu CBU, y el monto exacto de la seña. Sube
              la foto desde el celular y ve que el sistema la tiene.
            </Paso>
            <Paso n={4} titulo="Vos confirmás">
              Desde el panel, en el teléfono. Ves el comprobante, confirmás, y la
              reserva queda. O la rechazás y las noches se liberan al instante.
            </Paso>
          </ol>
        </div>
      </section>

      <section className="border-y border-black/10 bg-white/50 px-6 py-14 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">Qué todavía no hace</h2>
          <p className="mt-3 text-sm opacity-70">
            Está acá porque enterarse después es peor.
          </p>
          <ul className="mt-5 space-y-3 text-sm">
            <li className="flex gap-3">
              <span aria-hidden>·</span>
              <span>
                <strong>No manda mails.</strong> Al huésped le avisás vos por
                WhatsApp, que es por donde ya le escribís. Los mails automáticos
                están en camino.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden>·</span>
              <span>
                <strong>No cobra con tarjeta.</strong> La seña se transfiere a tu
                cuenta, directo. No pasa por nosotros, y no te cobramos comisión
                por reserva.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden>·</span>
              <span>
                <strong>Los precios y el calendario los cargamos nosotros</strong>{' '}
                por ahora, con vos, cuando arrancás. La pantalla para editarlos
                vos mismo está en camino.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden>·</span>
              <span>
                <strong>No se conecta con Booking ni con Airbnb.</strong> Si
                vendés por esos canales, las fechas hay que bloquearlas a mano.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="px-6 py-14 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">Cuánto sale</h2>
          <p className="mt-4 max-w-prose opacity-80">
            Se conversa. Depende de cuántas unidades tengas y de cuánto haya que
            cargar para arrancar, y preferimos decirte un número que sea el que
            vas a pagar antes que un «desde» que después cambia.
          </p>
          <p className="mt-3 max-w-prose opacity-80">
            Lo que sí está decidido: <strong>no cobramos comisión por reserva.</strong>{' '}
            La seña va a tu cuenta y no la tocamos.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={ENLACE_WHATSAPP}
              target="_blank"
              rel="noopener"
              className="rounded-2xl bg-[#2f5d50] px-6 py-3 font-semibold text-white"
            >
              Escribinos por WhatsApp
            </a>
            <a href={`mailto:${MAIL_CONTACTO}`} className="rounded-2xl border border-black/15 px-6 py-3 font-semibold">
              {MAIL_CONTACTO}
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/10 px-6 py-10 text-sm sm:px-8">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-4">
          <span className="opacity-60">AlojaOS · SOVARE studio · Mar del Plata</span>
          <a href="/login" className="underline opacity-70">
            Entrar al panel
          </a>
        </div>
      </footer>
    </div>
  );
}

function Problema({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <li>
      <h3 className="font-semibold">{titulo}</h3>
      <p className="mt-1 max-w-prose text-sm opacity-80">{children}</p>
    </li>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f5d50] text-sm font-semibold text-white">
        {n}
      </span>
      <div>
        <h3 className="font-semibold">{titulo}</h3>
        <p className="mt-0.5 max-w-prose text-sm opacity-80">{children}</p>
      </div>
    </li>
  );
}
