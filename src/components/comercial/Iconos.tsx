/**
 * Los cuatro íconos de la página comercial.
 *
 * Dibujados acá y no traídos de una librería de íconos, por una razón de peso
 * literal: cualquiera de las conocidas trae mil y pico de íconos y, aunque el
 * empaquetador descarte los que no se usan, agrega una dependencia más que
 * mantener para cuatro formas de veinte líneas.
 *
 * Los cuatro llevan `aria-hidden`: son decoración al lado de un texto que ya
 * dice lo mismo. Un lector de pantalla que los anunciara leería «tilde» antes
 * de cada línea de una lista de cinco, que es ruido.
 *
 * `shrink-0` está en todos a propósito: adentro de un `flex` con texto que
 * envuelve, un SVG sin eso se achica hasta quedar un rectángulo.
 */

const comunes = {
  'aria-hidden': true,
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Check({ color }: { color?: string }) {
  return (
    <svg
      {...comunes}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      strokeWidth={3}
      className="mt-0.5 shrink-0"
      style={color ? { color } : undefined}
    >
      <path d="M4 12.5l5.2 5.2L20 7" />
    </svg>
  );
}

export function Cruz({ color }: { color?: string }) {
  return (
    <svg
      {...comunes}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      strokeWidth={3}
      className="mt-0.5 shrink-0"
      style={color ? { color } : undefined}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * La flecha de los botones.
 *
 * Se corre tres píxeles cuando el botón está en hover. Es el detalle más barato
 * que existe para que un botón se sienta vivo, y `group-hover` lo resuelve sin
 * una línea de JavaScript.
 */
export function Flecha() {
  return (
    <svg
      {...comunes}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      strokeWidth={2.5}
      className="shrink-0 transition-transform group-hover:translate-x-0.5"
    >
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

/** Un punto. Separa cosas y marca el rótulo del hero. */
export function Punto({ color }: { color?: string }) {
  return (
    <svg viewBox="0 0 8 8" width="6" height="6" aria-hidden className="shrink-0" style={color ? { color } : undefined}>
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}
