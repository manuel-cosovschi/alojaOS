import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';

/**
 * Lo que vale para todas las páginas.
 *
 * El título y la descripción de verdad los pone cada página con
 * `generateMetadata()`: la de un complejo lleva su nombre, y la comercial la
 * suya. Esto es el piso por si alguna no lo hiciera.
 *
 * `metadataBase` existe para que `/og.png` se convierta en una dirección
 * absoluta: WhatsApp y los demás no siguen rutas relativas, así que sin esto la
 * vista previa sale sin imagen y nada falla.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://alojaos.shop'),
  title: 'AlojaOS',
  description: 'Reservas para complejos de 3 a 15 unidades.',
};

/**
 * La tipografía del producto: Archivo, de Omnibus-Type.
 *
 * Es una grotesca con pesos hasta 900 y con cursiva **de verdad** —no una
 * inclinación sintética—, que es lo que hacen falta para los titulares de la
 * página comercial. Y es de una fundidora argentina, que para un producto
 * argentino es una decisión que se puede contar.
 *
 * `next/font/google` **no** pide nada a Google en tiempo de ejecución: baja los
 * archivos al compilar y los sirve desde nuestro dominio. Eso importa por lo
 * mismo que la lista de tipografías del panel no tiene ninguna web: pedirle la
 * fuente a un tercero le cuenta a ese tercero quién visitó la página.
 *
 * `display: 'swap'` es a propósito: mientras la fuente baja, el texto se ve con
 * la del sistema. La alternativa —que no se vea nada hasta que llegue— es una
 * página en blanco por un recurso que es decoración.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-aloja',
  display: 'swap',
});

/**
 * Cómo se aplica.
 *
 * `archivo.variable` deja definida `--font-aloja` y el `@font-face` con los
 * archivos servidos desde nuestro dominio. Acá no se la aplica a nadie: la usa
 * quien apunte sus `--fuente-titulo` y `--fuente-cuerpo` a esa variable, y hoy
 * eso lo hace **sólo la página comercial**. El panel y el login siguen con la
 * del sistema; cuando se decida pasarlos, es una línea en cada uno.
 *
 * Lo que NO pasa es que se la coma la página de un complejo: ahí esas dos
 * variables las escribe su fila de `complejos`, y una tipografía nuestra pisando
 * la que el dueño eligió sería justamente lo que la pantalla de marca existe
 * para evitar.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={archivo.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
