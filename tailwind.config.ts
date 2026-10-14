import type { Config } from 'tailwindcss';

/**
 * La paleta NO está acá.
 *
 * En el sistema anterior los cuatro colores del complejo estaban repetidos
 * inline en cinco archivos HTML, y cambiarlos para un cliente nuevo era buscar
 * y reemplazar. Acá los colores son una fila de `complejos` y llegan al navegador
 * como variables CSS que el layout escribe en `:root` (ver `src/app/[complejo]`).
 * Tailwind sólo les pone nombre.
 */
/**
 * Un color de marca que acepta `/15`, `/10` y compañía.
 *
 * Esto existe por un bug que estuvo en producción sin que nadie lo notara.
 * `bg-marca-principal/15` escrito contra un color que es `'var(--marca-principal)'`
 * a secas compila sin una queja, pone la clase en el HTML, y pinta
 * `rgba(0,0,0,0)`: nada. Tailwind necesita poder meterle el alfa al color, y a
 * un `var()` no se lo puede meter.
 *
 * Eran cuatro lugares y los cuatro callados: las noches del medio de una
 * estadía elegida en el calendario, la unidad seleccionada, y dos de la
 * previsualización de la marca en el panel. El huésped elegía siete noches y
 * veía marcadas dos.
 *
 * `color-mix` arma el color con alfa en el navegador, que es el único que
 * conoce el valor de la variable. Cuando no hay modificador, `opacityValue`
 * llega como `var(--tw-bg-opacity, 1)`, así que el `calc()` cubre los dos
 * casos con una sola expresión.
 */
function conAlfa(variable: string) {
  const color = ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined
      ? `var(${variable})`
      : `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;

  // Tailwind acepta una función de color en tiempo de ejecución —está en su
  // documentación y el CSS que genera está comprobado—, pero el tipo `Config`
  // sólo admite cadenas en las hojas de `colors`. El cast es por el tipo, no
  // por el comportamiento.
  return color as unknown as string;
}

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          principal: conAlfa('--marca-principal'),
          fondo: conAlfa('--marca-fondo'),
          texto: conAlfa('--marca-texto'),
          acento: conAlfa('--marca-acento'),
        },
      },
      fontFamily: {
        titulo: 'var(--fuente-titulo)',
        cuerpo: 'var(--fuente-cuerpo)',
      },
    },
  },
};

export default config;
