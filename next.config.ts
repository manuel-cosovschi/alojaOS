import type { NextConfig } from 'next';

/**
 * Las cabeceras que el navegador necesita para protegernos.
 *
 * De las habituales, el despliegue traía **una sola**: `Strict-Transport-Security`,
 * que la pone Vercel. Las cuatro de acá son las que faltaban, y cada una tapa
 * algo concreto de este sistema, no una lista de buenas prácticas:
 *
 *   · **`frame-ancestors`** es la que importa. Sin ella, cualquiera puede meter
 *     `/login` o `/panel` adentro de un iframe en su página, ponerle algo
 *     encima y hacer que un dueño apriete «Confirmar la reserva» creyendo que
 *     aprieta otra cosa. Se permite `'self'` y los subdominios propios porque
 *     la página de venta va a mostrar el demo embebido, y ése es el mismo
 *     producto.
 *   · **`nosniff`** impide que el navegador adivine el tipo de un archivo. Acá
 *     se suben comprobantes, y un archivo que el huésped manda como imagen y
 *     el navegador decide tratar como HTML es un problema con nombre propio.
 *   · **`Referrer-Policy`** evita que, al salir desde la página de un complejo
 *     hacia WhatsApp o Instagram, se filtre la dirección completa desde la que
 *     salió —que incluye el subdominio del complejo—.
 *   · **`Permissions-Policy`** apaga cámara, micrófono y ubicación, que este
 *     sistema no usa en ninguna pantalla. Si algún día hiciera falta una, se
 *     prende acá y se ve en el diff.
 *
 * Lo que NO hay es una CSP completa de `script-src`: Next inyecta guiones
 * propios y armarla a medias —con `unsafe-inline`, como suele terminar— da la
 * sensación de protección sin la protección. Mejor no tenerla que tenerla de
 * adorno.
 */
const CABECERAS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://*.alojaos.shop" },
];

const config: NextConfig = {
  // Las fotos de las unidades viven en el Storage de Supabase, que sirve desde
  // el dominio del proyecto.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' }],
  },

  async headers() {
    return [{ source: '/:ruta*', headers: CABECERAS }];
  },
};

export default config;
