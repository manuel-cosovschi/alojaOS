import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

export const metadata: Metadata = {
  title: 'AlojaOS',
  description: 'El sistema de reservas de tu complejo.',
};

/**
 * La tipografía del producto se carga acá, y no se le aplica a nadie.
 *
 * `GeistSans.variable` deja definida `--font-geist-sans` y, lo que importa, el
 * `@font-face` con el archivo servido **desde nuestro dominio**. La páginas de
 * AlojaOS —la comercial, el login, el panel— se la ponen apuntando sus propias
 * `--fuente-titulo` y `--fuente-cuerpo` a esa variable.
 *
 * Lo que NO pasa es que se la coma la página de un complejo: ahí esas dos
 * variables las escribe su fila de `complejos`, y una tipografía nuestra pisando
 * la que el dueño eligió sería justamente lo que la pantalla de marca existe
 * para evitar.
 *
 * Y se sirve local, no desde Google Fonts, por el mismo motivo por el que la
 * lista de tipografías del panel no tiene ninguna web: pedirle la fuente a un
 * tercero le cuenta a ese tercero quién visitó la página.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={GeistSans.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
