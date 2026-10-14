/**
 * El producto, mostrado.
 *
 * ==================================================================
 * Antes acá había dibujos, y ahora hay capturas. Por qué cambió
 * ==================================================================
 * Las tres pantallas estaban reconstruidas en HTML con los mismos colores y las
 * mismas formas que el producto. El argumento era bueno y sigue siéndolo: una
 * captura envejece y nadie se entera, así que el día que el calendario cambie,
 * la imagen va a seguir mostrando el de antes y la página va a estar
 * prometiendo algo que no existe.
 *
 * Lo que cambió es que ahora ese riesgo tiene quién lo vigile:
 *
 *   1. Las capturas las saca `npm run capturas` recorriendo el sistema de
 *      verdad. Actualizarlas es un comando, no una tarde.
 *   2. `capturas.generado.ts` se escribe en la misma corrida, con la fecha y el
 *      tamaño real de cada PNG. Si falta una, es un error de compilación, no un
 *      hueco en la página.
 *   3. `npm run prueba:comercial` falla cuando la interfaz se tocó después de
 *      la última corrida. Una captura vieja deja de ser invisible.
 *   4. La página muestra la fecha y enlaza al demo al lado de cada imagen.
 *      Cualquiera abre la dirección y compara.
 *
 * Y lo que se gana es lo que un dibujo no puede dar: que lo que se ve sea
 * literalmente lo que hay. Un dibujo de un producto que existe es una decisión
 * difícil de explicar.
 */

import Image from 'next/image';
import { MARCA } from '@/lib/marca-alojaos';
import { CAPTURAS } from './capturas.generado';

type Clave = keyof typeof CAPTURAS;

/**
 * Una captura, con su tamaño de verdad.
 *
 * El ancho y el alto salen del PNG, así que `next/image` reserva el espacio
 * exacto antes de que la imagen cargue y la página no salta. `sizes` existe
 * para que no se baje una imagen de 1664 px de ancho a un celular.
 */
export function Captura({
  cual,
  prioridad = false,
  className = '',
  sizes = '(max-width: 768px) 92vw, 500px',
}: {
  cual: Clave;
  prioridad?: boolean;
  className?: string;
  sizes?: string;
}) {
  const c = CAPTURAS[cual];
  return (
    <Image
      src={c.archivo}
      width={c.ancho}
      height={c.alto}
      sizes={sizes}
      // `priority` sólo en la del hero: es la única que se ve sin scrollear, y
      // ponérselo a todas sería pedirle al navegador que baje cinco imágenes
      // antes de pintar nada.
      priority={prioridad}
      alt={c.que}
      className={`h-auto w-full ${className}`}
    />
  );
}

/**
 * El marco de teléfono.
 *
 * No es decoración: el dueño de un complejo chico atiende su negocio desde el
 * celular, y la mitad de las dudas de venta son «¿esto se puede usar del
 * teléfono?». Mostrarlo en un teléfono contesta eso sin una línea de texto.
 */
export function Telefono({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto w-full max-w-[300px] rounded-[2.2rem] p-2.5 shadow-xl"
      style={{ background: MARCA.tinta }}
    >
      <div className="overflow-hidden rounded-[1.7rem]" style={{ background: MARCA.crema }}>
        {children}
      </div>
    </div>
  );
}
