import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { slugDeLaPeticion } from '@/lib/complejo';
import { MAIL_CONTACTO, MAIL_SIN_CARGAR } from '@/lib/constants';

/**
 * Qué datos se juntan en alojaos.shop y para qué, sólo con lo que el sistema
 * hace de verdad. En el subdominio de un complejo no existe: los datos de sus
 * huéspedes son del complejo, y esta página habla de los nuestros.
 */

export const metadata: Metadata = { title: 'Privacidad · AlojaOS' };

const MEDICION = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.NEXT_PUBLIC_GA4_ID);

export default async function Privacidad() {
  if (await slugDeLaPeticion()) notFound();
  return (
    <main className="mx-auto max-w-2xl px-5 py-16 leading-relaxed">
      <h1 className="text-3xl font-bold">Privacidad</h1>
      <div className="mt-6 space-y-5">
        <p>AlojaOS es un producto de SOVARE. Esta página cuenta qué datos juntamos en alojaos.shop y para qué.</p>
        <h2 className="pt-2 text-lg font-semibold">Si nos dejás una consulta</h2>
        <p>
          Guardamos tu nombre, el de tu complejo, tu WhatsApp o mail, la cantidad de unidades si la dejás y lo que nos
          escribas, junto con la campaña por la que llegaste. Los usamos sólo para contestarte. No los vendemos, no los
          compartimos y no te sumamos a ninguna lista.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Los datos de tus huéspedes</h2>
        <p>
          Si contratás, las reservas y los datos de tus huéspedes son tuyos: ningún otro complejo los ve, el visitante de
          tu página sólo ve qué fechas están ocupadas, y si te vas te los llevás.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Medición de anuncios</h2>
        <p>
          {MEDICION
            ? 'En las páginas de venta usamos herramientas de medición de Meta y/o Google para saber qué anuncios funcionan. Reciben qué páginas visitaste y qué botones tocaste, nunca tu nombre, teléfono ni mail.'
            : 'Hoy no usamos herramientas de medición de terceros. Guardamos en tu navegador, en una cookie propia, la campaña por la que llegaste.'}
        </p>
        <h2 className="pt-2 text-lg font-semibold">Tus derechos</h2>
        <p>
          Podés pedirnos ver, corregir o borrar tus datos cuando quieras
          {MAIL_CONTACTO !== MAIL_SIN_CARGAR ? `, escribiendo a ${MAIL_CONTACTO}` : ''}. La Agencia de Acceso a la
          Información Pública es el órgano de control de la Ley 25.326.
        </p>
      </div>
    </main>
  );
}
