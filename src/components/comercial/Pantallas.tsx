/**
 * El producto, dibujado.
 *
 * Son las pantallas de verdad reconstruidas en HTML, no capturas. Tres motivos,
 * en orden de importancia:
 *
 *   1. **Una captura envejece y nadie se entera.** El día que el calendario
 *      cambie, la captura va a seguir mostrando el de antes y la página va a
 *      estar prometiendo algo que no existe. Esto se escribe con los mismos
 *      colores y las mismas formas que el producto, así que cuando el producto
 *      cambia, esto queda viejo de una manera visible.
 *   2. Se lee nítido en cualquier pantalla y pesa nada. Una captura de un
 *      calendario en un celular es un cuadrado borroso.
 *   3. No hay que subir imágenes a ningún lado ni acordarse de optimizarlas.
 *
 * Lo que NO es: una maqueta de algo que no existe. Cada número y cada texto de
 * acá sale de lo que el producto hace hoy —el mínimo de 7 noches, la estadía que
 * cruza de temporada, el comprobante confirmado— y eso es comprobable abriendo
 * el demo.
 */

import { MARCA } from '@/lib/marca-alojaos';

/** El calendario del huésped, con noches tomadas y una estadía elegida. */
export function PantallaCalendario() {
  // Enero arranca un viernes en 2027. Las etiquetas son las de verdad.
  const dias = Array.from({ length: 31 }, (_, i) => i + 1);
  const ocupadas = new Set([9, 10, 11, 12, 13, 14, 15]);
  const elegidas = new Set([16, 17, 18, 19, 20, 21, 22]);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">enero 2027</span>
        <div className="flex gap-1 text-sm opacity-40">
          <span className="rounded-lg px-2 py-0.5">←</span>
          <span className="rounded-lg px-2 py-0.5">→</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide opacity-40">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {/* Enero de 2027 empieza viernes: cuatro huecos. */}
        {[0, 1, 2, 3].map((i) => (
          <span key={`h${i}`} />
        ))}
        {dias.map((d) => {
          const tomada = ocupadas.has(d);
          const elegida = elegidas.has(d);
          return (
            <span
              key={d}
              className="flex h-8 items-center justify-center rounded-lg text-xs"
              style={
                tomada
                  ? { background: MARCA.cremaHonda, color: '#9aa5a3', textDecoration: 'line-through' }
                  : elegida
                    ? { background: MARCA.tinta, color: 'white', fontWeight: 600 }
                    : { color: MARCA.texto }
              }
            >
              {d}
            </span>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: MARCA.cremaHonda }}>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <strong>6 noches</strong>
          </span>
          <span>
            Total: <strong>$ 888.000</strong>
          </span>
          <span>
            Seña (50%): <strong>$ 444.000</strong>
          </span>
        </div>
        <p className="mt-1 opacity-60">La estadía cruza de temporada: cada noche se cobra según su fecha.</p>
      </div>
    </div>
  );
}

/** La pantalla del comprobante, que es la que cierra el círculo. */
export function PantallaComprobante() {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border p-4" style={{ borderColor: '#a7d0c4', background: '#eef7f3' }}>
        <p className="text-sm font-semibold" style={{ color: MARCA.tinta }}>
          Te guardamos la unidad
        </p>
        <p className="mt-1 text-xs" style={{ color: MARCA.tintaSuave }}>
          6 noches · Seña a transferir: <strong>$ 444.000</strong> de $ 888.000.
          <br />
          Vence el <strong>14/01, 18:30</strong>.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-50">Dónde transferir</p>
        <p className="mt-1 text-xs leading-relaxed">
          Alias: tucomplejo.mp
          <br />
          CBU: 0000003100000000000000
        </p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-50">El comprobante</p>
        <div className="mt-2 rounded-xl px-3 py-2 text-xs" style={{ background: '#eef7f3', color: MARCA.tinta }}>
          <p className="font-medium">Lo tenemos.</p>
          <p className="mt-0.5 opacity-80">El dueño lo va a revisar y te confirma la reserva.</p>
        </div>
      </div>
    </div>
  );
}

/** El panel del dueño: una seña esperando revisión. */
export function PantallaPanel() {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-sm font-semibold">Marcela Giardino</span>
          <span className="ml-2 text-xs opacity-50">CAB2</span>
        </div>
        <span className="text-xs">
          Seña: <strong>$ 444.000</strong>
        </span>
      </div>
      <p className="mt-0.5 text-xs opacity-60">16/01 → 22/01 · 4 personas</p>
      <p className="mt-1 text-xs" style={{ color: MARCA.acentoHondo }}>
        Vence el 14/01, 18:30.
      </p>

      <div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2 text-xs" style={{ background: MARCA.cremaHonda }}>
        <span>
          Comprobante subido el <strong>13/01, 21:04</strong>
        </span>
        <span className="rounded-lg px-2 py-1 text-[10px] font-semibold text-white" style={{ background: MARCA.tinta }}>
          Ver
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        <span
          className="rounded-xl px-3 py-1.5 text-[11px] font-semibold text-white"
          style={{ background: '#1f6b4d' }}
        >
          Confirmar la reserva
        </span>
        <span className="rounded-xl border px-3 py-1.5 text-[11px]" style={{ borderColor: '#d8d2c6' }}>
          Rechazar
        </span>
      </div>
    </div>
  );
}

/**
 * Un teléfono, para enmarcar lo de arriba.
 *
 * El marco no es decoración: el dueño de un complejo chico atiende su negocio
 * desde el celular, y la mitad de las dudas de venta son «¿esto se puede usar
 * del teléfono?». Mostrarlo en un teléfono contesta eso sin una línea de texto.
 */
export function Telefono({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto w-full max-w-[300px] rounded-[2.2rem] p-2.5 shadow-xl"
      style={{ background: MARCA.tinta }}
    >
      <div className="rounded-[1.7rem] p-3" style={{ background: MARCA.crema }}>
        {children}
      </div>
    </div>
  );
}
