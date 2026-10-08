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
 * El orden sigue el de GastroOS, que es el molde de la familia y ya está
 * probado vendiendo: producto, problema, por dentro, caso, calculadora, un día
 * cualquiera, comparación, por qué nosotros, cómo arrancamos, qué NO hace,
 * precio, preguntas.
 *
 * ==================================================================
 * Lo que esta página NO hace, y por qué
 * ==================================================================
 * **No tiene testimonios.** AlojaOS no tiene clientes todavía, así que
 * cualquier testimonio sería inventado. Un testimonio inventado se cae con una
 * sola pregunta —«¿me pasás el teléfono de ese complejo?»— y cuando se cae se
 * lleva puesta la credibilidad de todo lo demás, incluido lo que sí es cierto.
 *
 * **No tiene números de resultados.** Ni «aumentá tus reservas un 40 %» ni
 * «ahorrá 10 horas por semana». No los medimos. La calculadora, en cambio, usa
 * los números del que lee y calcula lo que deja de perder, que es lo único
 * sostenible.
 *
 * Lo que se pone en su lugar es más fuerte y es verdad: **el sistema ya corrió
 * en producción** en un complejo de la costa, y AlojaOS existe porque lo
 * auditamos y encontramos qué se rompía. Saber exactamente qué falla en un
 * sistema de reservas, con el detalle de cuántos meses falló, es una credencial
 * que no se improvisa.
 *
 * El complejo no se nombra, y eso no es timidez: nombrar a un cliente en una
 * página de venta necesita su permiso, y además `npm run sin-marca` falla si la
 * marca de un cliente aparece como texto en el código. La herramienta y la
 * decisión apuntan al mismo lado.
 */

import { ENLACE_WHATSAPP, MAIL_CONTACTO } from '@/lib/constants';
import { MARCA } from '@/lib/marca-alojaos';
import { Calculadora } from './Calculadora';
import { PantallaCalendario, PantallaComprobante, PantallaPanel, Telefono } from './Pantallas';

const SECCIONES = [
  { id: 'producto', texto: 'Producto' },
  { id: 'por-dentro', texto: 'Por dentro' },
  { id: 'cuenta', texto: 'La cuenta' },
  { id: 'comparacion', texto: 'Comparación' },
  { id: 'precio', texto: 'Precio' },
  { id: 'preguntas', texto: 'Preguntas' },
];

export function Comercial() {
  return (
    <div style={{ background: MARCA.crema, color: MARCA.texto }}>
      <Navegacion />
      <Hero />
      <LaReglaQueNoSePuedeRomper />
      <ElProblema />
      <PorDentro />
      <DeDondeSale />
      <LaCuenta />
      <UnDiaCualquiera />
      <Comparacion />
      <PorQueNosotros />
      <ComoArrancamos />
      <QueNoHace />
      <Precio />
      <Preguntas />
      <CierreFinal />
      <Pie />
    </div>
  );
}

/* ================================================================== */

function Navegacion() {
  return (
    <header
      className="sticky top-0 z-20 border-b backdrop-blur"
      style={{ borderColor: 'rgba(0,0,0,.07)', background: 'rgba(251,249,245,.85)' }}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <a href="#" className="text-sm font-semibold tracking-tight" style={{ color: MARCA.tinta }}>
          AlojaOS
        </a>
        {/* Los enlaces se esconden en el celular: seis enlaces apretados en 360
            píxeles no los toca nadie, y el que entra desde WhatsApp scrollea. */}
        <ul className="hidden gap-5 text-sm md:flex" style={{ color: MARCA.textoSuave }}>
          {SECCIONES.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="hover:underline">
                {s.texto}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <a href="/login" className="hidden text-sm hover:underline sm:block" style={{ color: MARCA.textoSuave }}>
            Entrar
          </a>
          <a
            href={ENLACE_WHATSAPP}
            target="_blank"
            rel="noopener"
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: MARCA.acento }}
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
    <section className="px-5 pb-14 pt-14 sm:px-8 sm:pt-20">
      <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: MARCA.acento }}>
            Para complejos de 3 a 15 unidades
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            Tus cabañas se reservan solas.
            <br />
            <span style={{ color: MARCA.tinta }}>Y nunca dos veces la misma noche.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed" style={{ color: MARCA.textoSuave }}>
            Una página de reservas con tu nombre y tus colores, donde el huésped
            elige las noches, ve el precio, transfiere la seña y sube el
            comprobante. Vos lo confirmás desde el teléfono.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={ENLACE_WHATSAPP}
              target="_blank"
              rel="noopener"
              className="rounded-2xl px-6 py-3.5 font-semibold text-white shadow-sm"
              style={{ background: MARCA.acento }}
            >
              Hablemos por WhatsApp
            </a>
            <a
              href="#por-dentro"
              className="rounded-2xl border px-6 py-3.5 font-semibold"
              style={{ borderColor: 'rgba(13,59,62,.2)', color: MARCA.tinta }}
            >
              Ver el producto
            </a>
          </div>

          {/* Las tres cosas que esta persona pregunta antes de nada. */}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: MARCA.textoSuave }}>
            <li>· Sin comisión por reserva</li>
            <li>· La seña va a tu cuenta</li>
            <li>· Se usa del celular</li>
          </ul>
        </div>

        <div className="lg:pl-6">
          <Telefono>
            <PantallaCalendario />
          </Telefono>
        </div>
      </div>
    </section>
  );
}

/**
 * La regla, sola, en una franja oscura.
 *
 * Es lo primero después del hero porque es lo único que ningún competidor de
 * este tamaño puede prometer de verdad, y porque es el miedo concreto del que
 * lee: que dos familias lleguen el mismo día a la misma cabaña.
 */
function LaReglaQueNoSePuedeRomper() {
  return (
    <section id="producto" className="px-5 py-16 sm:px-8" style={{ background: MARCA.tinta, color: 'white' }}>
      <div className="mx-auto max-w-3xl sm:text-center">
        <h2 className="text-2xl font-semibold leading-tight sm:text-3xl">
          Dos reservas sobre la misma noche no pueden pasar.
          <br />
          <span style={{ color: MARCA.salvia }}>No «no deberían». No pueden.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,.78)' }}>
          La mayoría de los sistemas lo chequean antes de guardar: miran si está
          libre y, si lo está, guardan. Entre esas dos cosas hay un instante, y
          en ese instante entran dos reservas. Pasa poco y pasa el fin de semana
          largo, que es cuando más duele.
        </p>
        <p className="mx-auto mt-4 max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,.78)' }}>
          Acá la regla no está en la página ni en una planilla: está en la base
          de datos, que <strong>rechaza</strong> la segunda reserva aunque las dos
          lleguen en el mismo milisegundo. Es la única parte de este sistema que
          no depende de que nadie se acuerde de nada.
        </p>
        <p className="mt-6 text-sm" style={{ color: 'rgba(255,255,255,.5)' }}>
          Y está probado con dos reservas simultáneas de verdad, en cada cambio
          que hacemos.
        </p>
      </div>
    </section>
  );
}

function ElProblema() {
  const casos = [
    {
      titulo: '«Me reservaron dos veces la misma cabaña»',
      texto:
        'No puede pasar, y no por cuidado: la base rechaza la segunda. Es lo de arriba.',
    },
    {
      titulo: '«No sé quién transfirió y quién no»',
      texto:
        'Cada seña tiene su plazo. El huésped sube el comprobante y lo ve confirmado en su pantalla; vos lo abrís desde el panel. Si el plazo pasa sin transferencia, las noches se liberan solas.',
    },
    {
      titulo: '«Tengo fechas bloqueadas y no me acuerdo por qué»',
      texto:
        'Un bloqueo tuyo es una fila con su motivo escrito. Desbloquear cambia esa fila y el sistema te dice cuántas liberó, no «listo».',
    },
    {
      titulo: '«Cada vez que cambio un precio tengo que avisarle a alguien»',
      texto:
        'Precios, mínimos de noches y días de entrada son datos tuyos. Temporada alta con mínimo de 7 noches entrando sábado o domingo se carga una vez y la página la respeta.',
    },
    {
      titulo: '«La página dice una cosa y la realidad es otra»',
      texto:
        'Una estadía que cruza de temporada se cobra cada noche según su fecha, y la pantalla lo explica. Si una unidad no tiene tarifa cargada, lo dice: no inventa un precio.',
    },
    {
      titulo: '«Contesto las mismas cuatro preguntas todo el día»',
      texto:
        '¿Está libre? ¿Cuánto sale? ¿Cuánto es la seña? ¿A dónde transfiero? Las cuatro están en la página, antes de que te escriba.',
    },
  ];

  return (
    <section className="px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Si esto te pasó, es para vos</h2>
        <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {casos.map((c) => (
            <div key={c.titulo}>
              <h3 className="font-semibold" style={{ color: MARCA.tinta }}>
                {c.titulo}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MARCA.textoSuave }}>
                {c.texto}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PorDentro() {
  return (
    <section
      id="por-dentro"
      className="border-y px-5 py-16 sm:px-8 sm:py-20"
      style={{ borderColor: 'rgba(0,0,0,.07)', background: MARCA.cremaHonda }}
    >
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Esto es el producto, no una maqueta
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: MARCA.textoSuave }}>
          Las tres pantallas que importan, tal como son. En la primera charla te
          mandamos <strong>tu</strong> dirección con tus unidades y tus precios
          cargados, para que reserves vos mismo antes de que exista para nadie.
        </p>

        <div className="mt-10 grid items-stretch gap-10 md:grid-cols-3">
          <Pantalla
            n={1}
            titulo="Elige las noches"
            texto="El calendario ya sabe qué está tomado, cuál es el mínimo del tramo y qué días se puede entrar. Nada de eso se explica después de completar un formulario."
          >
            <PantallaCalendario />
          </Pantalla>
          <Pantalla
            n={2}
            titulo="Transfiere y sube el comprobante"
            texto="Ve el monto exacto de la seña, tu alias y tu CBU, y hasta cuándo tiene. Sube la foto desde el celular y la pantalla le confirma que el sistema la tiene."
          >
            <PantallaComprobante />
          </Pantalla>
          <Pantalla
            n={3}
            titulo="Vos confirmás"
            texto="Desde el teléfono. Ves el comprobante, confirmás, y la reserva queda. O la rechazás con un motivo y las noches se liberan al instante."
          >
            <PantallaPanel />
          </Pantalla>
        </div>
      </div>
    </section>
  );
}

function Pantalla({
  n,
  titulo,
  texto,
  children,
}: {
  n: number;
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-rows-[1fr_auto_auto]">
      <div className="rounded-2xl p-3" style={{ background: MARCA.crema }}>
        {children}
      </div>
      <h3 className="mt-4 flex items-baseline gap-2 font-semibold">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: MARCA.tinta }}
        >
          {n}
        </span>
        {titulo}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MARCA.textoSuave }}>
        {texto}
      </p>
    </div>
  );
}

/**
 * De dónde sale. Esta sección es la credibilidad de toda la página.
 *
 * Y la forma de contarlo es contar los bugs, no esconderlos. Un proveedor que
 * te dice «mirá los tres errores que encontramos y cómo los cerramos» es más
 * creíble que uno que te dice que su sistema es excelente, sobre todo para
 * alguien que ya se quemó con un sistema que le prometieron excelente.
 */
function DeDondeSale() {
  return (
    <section className="px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          No es un sistema nuevo. Es uno que ya corrió, auditado y vuelto a hacer
        </h2>
        <p className="mt-4 leading-relaxed" style={{ color: MARCA.textoSuave }}>
          AlojaOS sale de un sistema de reservas que estuvo en producción en un
          complejo de cinco cabañas de la costa atlántica: reservas por la web,
          señas con plazo, calendario con mínimos de temporada. Andaba.
        </p>
        <p className="mt-4 leading-relaxed" style={{ color: MARCA.textoSuave }}>
          Antes de venderlo lo auditamos entero. Esto es lo que encontramos, y es
          la razón por la que este producto está escrito como está:
        </p>

        <ul className="mt-8 space-y-6">
          <Hallazgo
            titulo="Ningún comprobante se guardó nunca"
            cuanto="Desde el primer día, meses"
            texto="La subida contestaba «listo» y el archivo no llegaba a ninguna parte: el error de guardado se ignoraba a propósito, con un argumento razonable —un problema de almacenamiento no puede cortarle la reserva a un huésped—. El panel decía «sin comprobante» para todos y nadie supo por qué."
            comoSeArreglo="Acá la reserva tampoco se cae. Lo que no se hace es decir que el comprobante llegó cuando no llegó: después de subir, la pantalla le vuelve a preguntar a la base, y si la base dice que no, la persona lo ve y puede reintentar."
          />
          <Hallazgo
            titulo="Desbloquear una fecha no desbloqueaba nada"
            cuanto="Siete meses"
            texto="El botón contestaba «listo, 1 fecha liberada» sin tocar la base. El dueño cerraba el panel tranquilo y la fecha seguía bloqueada."
            comoSeArreglo="Un bloqueo es una fila, igual que una reserva. Desbloquear le cambia el estado y la base cuenta las filas que cambió. No hay dónde inventar un número."
          />
          <Hallazgo
            titulo="El reloj que vencía las señas estaba apagado"
            cuanto="Sin fecha conocida"
            texto="Las señas que no se transferían no vencían solas. Las noches quedaban tomadas hasta que alguien lo notaba a mano, y no había ninguna pantalla donde notarlo."
            comoSeArreglo="Corre en la base cada cinco minutos, y el panel te dice si NO está corriendo. Que exista una tarea programada no es que esté corriendo: el panel mira la última vez que corrió de verdad."
          />
        </ul>

        <p className="mt-8 rounded-2xl p-5 text-sm leading-relaxed" style={{ background: MARCA.cremaHonda }}>
          Los tres tienen la misma forma: <strong>algo contestaba que estaba bien
          sin estarlo.</strong> Ninguno tiraba un error, ninguno aparecía en una
          pantalla, y los tres duraron meses porque la única forma de notarlos era
          que alguien fuera a buscar. Es la clase de falla que no se arregla
          revisando mejor: se arregla haciendo que la operación no pueda decir que
          hizo algo sin haberlo hecho.
        </p>
      </div>
    </section>
  );
}

function Hallazgo({
  titulo,
  cuanto,
  texto,
  comoSeArreglo,
}: {
  titulo: string;
  cuanto: string;
  texto: string;
  comoSeArreglo: string;
}) {
  return (
    <li className="border-l-2 pl-5" style={{ borderColor: MARCA.acento }}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-semibold">{titulo}</h3>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: 'rgba(194,90,52,.12)', color: MARCA.acentoHondo }}
        >
          {cuanto}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MARCA.textoSuave }}>
        {texto}
      </p>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: MARCA.tinta }}>
        <strong>Cómo quedó:</strong> {comoSeArreglo}
      </p>
    </li>
  );
}

function LaCuenta() {
  return (
    <section
      id="cuenta"
      className="border-y px-5 py-16 sm:px-8 sm:py-20"
      style={{ borderColor: 'rgba(0,0,0,.07)', background: MARCA.cremaHonda }}
    >
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          ¿Cuánto te cuesta una noche que no pudiste vender?
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: MARCA.textoSuave }}>
          Movelo con tus números. No te pedimos el mail para ver el resultado.
        </p>
        <div className="mt-8">
          <Calculadora />
        </div>
      </div>
    </section>
  );
}

function UnDiaCualquiera() {
  const filas = [
    {
      hora: '09:40',
      sin: 'Te escriben por Instagram: «¿tienen libre del 10 al 17?». Abrís la planilla en el celular.',
      con: 'Entra una reserva. El calendario ya le dijo que esas noches están tomadas y eligió otras.',
    },
    {
      hora: '11:15',
      sin: 'Otro mensaje, mismas fechas. Contestás que sí sin acordarte del primero.',
      con: 'Nada que hacer: la base no deja que dos tomen la misma noche.',
    },
    {
      hora: '14:00',
      sin: '«¿Cuánto es la seña?» Abrís la calculadora del teléfono.',
      con: 'El huésped ya vio el total, la seña y tu CBU, y transfirió.',
    },
    {
      hora: '18:30',
      sin: 'Te llega una foto de un comprobante por WhatsApp. La guardás en una carpeta.',
      con: 'El comprobante está en la reserva. Lo abrís, confirmás, y queda.',
    },
    {
      hora: '23:00',
      sin: 'Repasás la planilla para ver quién transfirió y quién no. Hay tres fechas bloqueadas que no te acordás por qué.',
      con: 'Las señas que no llegaron vencieron solas y esas noches ya están a la venta.',
    },
  ];

  return (
    <section className="px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Lo que cambia no son las funciones, es el día
        </h2>

        <div className="mt-8 overflow-hidden rounded-2xl ring-1" style={{ ringColor: 'rgba(0,0,0,.07)' } as React.CSSProperties}>
          <div className="grid grid-cols-1 sm:grid-cols-[4rem_1fr_1fr]">
            <div className="hidden sm:block" style={{ background: MARCA.cremaHonda }} />
            <div
              className="hidden px-5 py-3 text-xs font-semibold tracking-wide sm:block"
              style={{ background: MARCA.cremaHonda, color: MARCA.textoSuave }}
            >
              Hoy
            </div>
            <div
              className="hidden px-5 py-3 text-xs font-semibold tracking-wide sm:block"
              style={{ background: MARCA.tinta, color: 'rgba(255,255,255,.8)' }}
            >
              Con AlojaOS
            </div>

            {filas.map((f) => (
              <div key={f.hora} className="contents">
                <div
                  className="border-t px-5 py-3 text-xs font-semibold tabular-nums sm:px-3"
                  style={{ borderColor: 'rgba(0,0,0,.07)', background: MARCA.cremaHonda, color: MARCA.textoSuave }}
                >
                  {f.hora}
                </div>
                <div
                  className="border-t px-5 py-3 text-sm leading-relaxed"
                  style={{ borderColor: 'rgba(0,0,0,.07)', background: 'white', color: MARCA.textoSuave }}
                >
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide opacity-50 sm:hidden">
                    Hoy
                  </span>
                  {f.sin}
                </div>
                <div
                  className="border-t px-5 py-3 text-sm leading-relaxed"
                  style={{ borderColor: 'rgba(255,255,255,.12)', background: MARCA.tinta, color: 'rgba(255,255,255,.88)' }}
                >
                  <span className="mb-1 block text-[10px] font-semibold tracking-wide opacity-60 sm:hidden">
                    Con AlojaOS
                  </span>
                  {f.con}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Comparacion() {
  const filas: Array<{ que: string; planilla: string; portales: string; aloja: string }> = [
    {
      que: 'Doble reserva',
      planilla: 'Depende de que te acuerdes',
      portales: 'No pasa, pero sólo en su canal',
      aloja: 'La base la rechaza',
    },
    {
      que: 'Comisión por reserva',
      planilla: 'Ninguna',
      portales: '15 % a 18 %',
      aloja: 'Ninguna',
    },
    {
      que: 'Dónde cae la seña',
      planilla: 'Tu cuenta',
      portales: 'Pasa por ellos',
      aloja: 'Tu cuenta, directo',
    },
    {
      que: 'Quién es el dueño del huésped',
      planilla: 'Vos',
      portales: 'Ellos: no te dan el mail',
      aloja: 'Vos',
    },
    {
      que: 'Tu marca',
      planilla: '—',
      portales: 'La de ellos',
      aloja: 'Tu nombre, tus colores, tu dirección',
    },
    {
      que: 'Señas vencidas',
      planilla: 'Las revisás a mano',
      portales: 'No manejan seña por transferencia',
      aloja: 'Se liberan solas',
    },
    {
      que: 'Reglas de temporada',
      planilla: 'En tu cabeza',
      portales: 'Sí, con sus formatos',
      aloja: 'Mínimos y días de entrada, por tramo',
    },
  ];

  return (
    <section
      id="comparacion"
      className="border-y px-5 py-16 sm:px-8 sm:py-20"
      style={{ borderColor: 'rgba(0,0,0,.07)', background: MARCA.cremaHonda }}
    >
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Contra qué lo estás comparando
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed" style={{ color: MARCA.textoSuave }}>
          Los portales no son el enemigo y conviene decirlo: te traen gente que
          no te conoce. Lo que no conviene es que sean tu único canal, porque la
          comisión se la llevan también de los huéspedes que ya eran tuyos.
        </p>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-[26%] px-4 py-3 text-left font-semibold" />
                <th className="px-4 py-3 text-left font-semibold" style={{ color: MARCA.textoSuave }}>
                  Planilla y WhatsApp
                </th>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: MARCA.textoSuave }}>
                  Booking / Airbnb
                </th>
                <th
                  className="rounded-t-xl px-4 py-3 text-left font-semibold text-white"
                  style={{ background: MARCA.tinta }}
                >
                  AlojaOS
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.que}>
                  <th className="border-t px-4 py-3 text-left align-top font-medium" style={{ borderColor: 'rgba(0,0,0,.08)' }}>
                    {f.que}
                  </th>
                  <td className="border-t px-4 py-3 align-top" style={{ borderColor: 'rgba(0,0,0,.08)', color: MARCA.textoSuave }}>
                    {f.planilla}
                  </td>
                  <td className="border-t px-4 py-3 align-top" style={{ borderColor: 'rgba(0,0,0,.08)', color: MARCA.textoSuave }}>
                    {f.portales}
                  </td>
                  <td
                    className={`px-4 py-3 align-top font-medium text-white ${i === filas.length - 1 ? 'rounded-b-xl' : ''}`}
                    style={{ background: MARCA.tinta, borderTop: '1px solid rgba(255,255,255,.12)' }}
                  >
                    {f.aloja}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function PorQueNosotros() {
  const razones = [
    {
      titulo: 'No cobramos comisión',
      texto:
        'Ni por reserva ni por huésped. La seña va a tu cuenta y no la tocamos. Lo que pagás es el sistema, y es el mismo número vendas mucho o poco.',
    },
    {
      titulo: 'Tus huéspedes son tuyos',
      texto:
        'El nombre, el mail y el teléfono de cada uno están en tu base, y te los podés llevar. No es una cortesía: es tu lista de clientes.',
    },
    {
      titulo: 'Un complejo no ve nada de otro',
      texto:
        'Cada complejo está aislado en la base, no por un filtro que alguien se puede olvidar de poner. Lo probamos con dos cuentas de verdad pidiendo los datos de la otra, y no los ve.',
    },
    {
      titulo: 'El sistema te dice cuando se rompe',
      texto:
        'Si el reloj de los vencimientos se para, el panel te lo dice. Si no se pueden guardar comprobantes, te lo dice. Si a un huésped no le llegó su mail, te dice a quién escribirle.',
    },
    {
      titulo: 'Somos dos personas en Mar del Plata',
      texto:
        'Nos escribís y te contestamos nosotros, no un ticket. La contra es que no somos una empresa de cien personas; si eso es lo que buscás, mejor decirlo ahora.',
    },
    {
      titulo: 'Sin permanencia',
      texto:
        'Te vas cuando quieras y te llevás tus datos. Un sistema que te retiene porque es difícil salirse no es un sistema que elegiste.',
    },
  ];

  return (
    <section className="px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Por qué elegirnos</h2>
        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {razones.map((r) => (
            <div key={r.titulo}>
              <h3 className="font-semibold" style={{ color: MARCA.tinta }}>
                {r.titulo}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MARCA.textoSuave }}>
                {r.texto}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComoArrancamos() {
  const pasos = [
    {
      titulo: 'Una charla',
      texto:
        'Veinte minutos por teléfono o por video. Nos contás cuántas unidades tenés, cómo cobrás y qué reglas de temporada manejás. De ahí sale el número y si esto te sirve o no.',
    },
    {
      titulo: 'Lo cargamos nosotros',
      texto:
        'Tus unidades, tus precios por temporada, los mínimos de noches, los días de entrada, tus datos de transferencia y tus colores. No te dejamos solo frente a un formulario vacío.',
    },
    {
      titulo: 'Lo mirás antes de que exista para nadie',
      texto:
        'Te mandamos tu dirección con todo cargado. Reservás vos mismo una vez de punta a punta para ver qué ve un huésped. Si algo está mal, se cambia ahí.',
    },
    {
      titulo: 'Lo publicás',
      texto:
        'Pones la dirección en tu Instagram y en tu WhatsApp. Nosotros seguimos del otro lado: si algo no anda, lo arreglamos sin que tengas que explicarlo dos veces.',
    },
  ];

  return (
    <section
      className="border-y px-5 py-16 sm:px-8 sm:py-20"
      style={{ borderColor: 'rgba(0,0,0,.07)', background: MARCA.cremaHonda }}
    >
      <div className="mx-auto max-w-4xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          De la primera charla a tu página andando
        </h2>
        <ol className="mt-8 space-y-6">
          {pasos.map((p, i) => (
            <li key={p.titulo} className="flex gap-5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold text-white"
                style={{ background: MARCA.tinta }}
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{p.titulo}</h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: MARCA.textoSuave }}>
                  {p.texto}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * Qué NO hace.
 *
 * Suena a contraindicación y es lo contrario: para esta persona —que ya se
 * quemó con alguien que le prometió de más— es la sección que hace creíble todo
 * el resto. Y además filtra: el que necesita conexión con Booking se va antes
 * de que le dediquemos una reunión, que es mejor para los dos.
 */
function QueNoHace() {
  const limites = [
    {
      titulo: 'No manda mails todavía',
      texto:
        'Está construido y falta conectar el proveedor. Mientras tanto le avisás vos por WhatsApp, que es por donde ya le escribís. Y si un aviso no sale, el panel te dice a quién.',
    },
    {
      titulo: 'No cobra con tarjeta',
      texto:
        'La seña se transfiere a tu cuenta. Es la contracara de no cobrarte comisión: no pasa plata por nosotros.',
    },
    {
      titulo: 'Los precios y el calendario los cargamos nosotros',
      texto:
        'Por ahora, con vos, cuando arrancás y cuando cambia la temporada. La pantalla para editarlos vos mismo está en camino.',
    },
    {
      titulo: 'No se conecta con Booking ni con Airbnb',
      texto:
        'Si vendés por esos canales, las fechas hay que bloquearlas a mano. Es lo primero que vamos a construir si varios lo piden.',
    },
    {
      titulo: 'No tiene facturación ni AFIP',
      texto: 'Seguís facturando como hasta ahora.',
    },
    {
      titulo: 'No hay app para descargar',
      texto:
        'Es una página que funciona en el navegador del celular. Se puede agregar a la pantalla de inicio y se ve igual que una app.',
    },
  ];

  return (
    <section className="px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Qué todavía no hace</h2>
        <p className="mt-3 leading-relaxed" style={{ color: MARCA.textoSuave }}>
          Está acá porque enterarse después es peor, y porque si algo de esta
          lista es imprescindible para vos, mejor que lo sepamos los dos ahora.
        </p>
        <div className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {limites.map((l) => (
            <div key={l.titulo} className="border-l-2 pl-4" style={{ borderColor: 'rgba(0,0,0,.12)' }}>
              <h3 className="text-sm font-semibold">{l.titulo}</h3>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: MARCA.textoSuave }}>
                {l.texto}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Precio() {
  return (
    <section
      id="precio"
      className="px-5 py-16 sm:px-8 sm:py-20"
      style={{ background: MARCA.tinta, color: 'white' }}
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cuánto cuesta</h2>

        <div className="mt-6 space-y-4 leading-relaxed" style={{ color: 'rgba(255,255,255,.8)' }}>
          <p>
            Un abono por mes, según cuántas unidades tengas, más una puesta a
            punto por única vez para cargar todo. El número sale de la primera
            charla, y preferimos decirte uno que sea el que vas a pagar antes que
            un «desde» que después cambia.
          </p>
          <p>
            Lo que sí está decidido, y no depende de la charla:
          </p>
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { q: 'Cero comisión', a: 'Ni por reserva ni por huésped. Vendas mucho o poco, pagás lo mismo.' },
            { q: 'Cero permanencia', a: 'Te vas cuando quieras y te llevás tus datos.' },
            { q: 'La seña es tuya', a: 'Va directo a tu cuenta. No pasa por nosotros.' },
          ].map((c) => (
            <li key={c.q} className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.07)' }}>
              <p className="font-semibold">{c.q}</p>
              <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,.7)' }}>
                {c.a}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={ENLACE_WHATSAPP}
            target="_blank"
            rel="noopener"
            className="rounded-2xl px-6 py-3.5 font-semibold text-white"
            style={{ background: MARCA.acento }}
          >
            Pedí tu número por WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}

function Preguntas() {
  const preguntas = [
    {
      q: '¿Y si no me llevo bien con la computadora?',
      a: 'Lo cargamos nosotros y vos usás una sola pantalla: la lista de señas que esperan, con dos botones. Confirmar y rechazar. Si algo hay que cambiar, nos escribís.',
    },
    {
      q: '¿Qué pasa con los datos de mis huéspedes?',
      a: 'Son tuyos y están aislados: ningún otro complejo los ve, y el visitante de tu página no ve quién ocupa una fecha, sólo que está ocupada. Si te vas, te los llevás.',
    },
    {
      q: '¿Puedo bloquear fechas para mi familia?',
      a: 'Sí, y el bloqueo lleva un motivo escrito para que en marzo sepas por qué esa semana estaba cerrada. Ocupa la noche igual que una reserva, así que nadie te la puede tomar.',
    },
    {
      q: '¿Qué pasa si alguien reserva y no transfiere?',
      a: 'Le guardás la unidad las horas que vos decidas. Si el plazo pasa, las noches se liberan solas y vuelven a estar a la venta. No tenés que revisar nada.',
    },
    {
      q: '¿Sirve si tengo una sola cabaña? ¿Y si tengo veinte?',
      a: 'Con una funciona, pero probablemente no te haga falta. Con más de quince empezás a necesitar cosas que todavía no tiene —limpieza, turnos, varios usuarios— y conviene que lo hablemos antes.',
    },
    {
      q: '¿Qué pasa si dejo de pagar?',
      a: 'Tu página deja de tomar reservas y tus datos quedan. Te los exportamos para que te los lleves. No se borra nada de un día para el otro.',
    },
    {
      q: '¿Puedo usar mi propio dominio?',
      a: 'Sí. Por defecto tu página vive en tucomplejo.alojaos.shop, y si tenés tu dominio lo apuntamos ahí.',
    },
    {
      q: '¿Cómo sé que esto no se va a caer el fin de semana largo?',
      a: 'Es la pregunta correcta. Cada cambio que hacemos pasa por una batería de pruebas que incluye dos reservas simultáneas sobre la misma noche, y se corre contra la base de verdad, no contra una copia. Y el panel te dice si algo del sistema dejó de funcionar, en vez de esperar que lo notes.',
    },
  ];

  return (
    <section id="preguntas" className="px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Lo que nos preguntan</h2>
        <dl className="mt-8 divide-y" style={{ borderColor: 'rgba(0,0,0,.08)' }}>
          {preguntas.map((p) => (
            <div key={p.q} className="py-5">
              <dt className="font-semibold">{p.q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed" style={{ color: MARCA.textoSuave }}>
                {p.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function CierreFinal() {
  return (
    <section
      className="border-y px-5 py-16 sm:px-8 sm:py-20"
      style={{ borderColor: 'rgba(0,0,0,.07)', background: MARCA.cremaHonda }}
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Veámoslo con tu complejo adelante
        </h2>
        <p className="mt-4 leading-relaxed" style={{ color: MARCA.textoSuave }}>
          Contanos cuántas unidades tenés y cómo cobrás. En la misma charla sale
          el número y si esto te sirve.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={ENLACE_WHATSAPP}
            target="_blank"
            rel="noopener"
            className="rounded-2xl px-6 py-3.5 font-semibold text-white shadow-sm"
            style={{ background: MARCA.acento }}
          >
            Escribinos por WhatsApp
          </a>
          <a
            href={`mailto:${MAIL_CONTACTO}`}
            className="rounded-2xl border px-6 py-3.5 font-semibold"
            style={{ borderColor: 'rgba(13,59,62,.2)', color: MARCA.tinta }}
          >
            {MAIL_CONTACTO}
          </a>
        </div>
      </div>
    </section>
  );
}

function Pie() {
  return (
    <footer className="px-5 py-10 text-sm sm:px-8" style={{ background: MARCA.tinta, color: 'rgba(255,255,255,.65)' }}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <span>
          <strong style={{ color: 'white' }}>AlojaOS</strong> · SOVARE studio · Mar del Plata
        </span>
        <div className="flex gap-5">
          <a href="/login" className="hover:underline">
            Entrar al panel
          </a>
          <a href={ENLACE_WHATSAPP} target="_blank" rel="noopener" className="hover:underline">
            WhatsApp
          </a>
        </div>
      </div>
    </footer>
  );
}
