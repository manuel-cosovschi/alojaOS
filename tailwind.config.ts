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
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          principal: 'var(--marca-principal)',
          fondo: 'var(--marca-fondo)',
          texto: 'var(--marca-texto)',
          acento: 'var(--marca-acento)',
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
