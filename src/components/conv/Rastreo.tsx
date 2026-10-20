'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { capturarAtribucion } from '@/lib/conv/atribucion';
import { rastrear, type NombreDeEvento } from '@/lib/conv/eventos';

/**
 * El rastreo de la página de conversión.
 *
 * - **El píxel de Meta y GA4 se cargan sólo si su identificador está cargado**
 *   (`NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA4_ID`). Sin eso no se baja un
 *   solo script de terceros: la página no paga peso por algo que no mide.
 * - **La atribución se guarda siempre**, haya píxel o no: la necesita el
 *   formulario para anotar de qué campaña vino cada consulta.
 * - **Los clics se escuchan por atributo**: cualquier enlace con
 *   `data-conv-evento="InitiateCheckout"` manda ese evento al tocarlo. Así los
 *   componentes del servidor (los planes) no tienen que volverse de cliente
 *   para medir un clic.
 */

const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
const GA4 = process.env.NEXT_PUBLIC_GA4_ID?.trim();

export function Rastreo({ producto }: { producto: string }) {
  useEffect(() => {
    const atribucion = capturarAtribucion();

    const alTocar = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-conv-evento]');
      if (!el) return;
      rastrear(el.dataset.convEvento as NombreDeEvento, {
        producto,
        atribucion,
        plan: el.dataset.convPlan,
        valor: el.dataset.convValor ? Number(el.dataset.convValor) : undefined,
      });
    };
    document.addEventListener('click', alTocar);

    // Ver los planes es la señal de interés más fuerte antes de un clic.
    const planes = document.getElementById('planes');
    const observador =
      planes && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => {
            if (e?.isIntersecting) {
              rastrear('ViewContent', { producto, atribucion, contenido: 'planes' });
              observador?.disconnect();
            }
          }, { threshold: 0.3 })
        : null;
    if (planes) observador?.observe(planes);

    return () => {
      document.removeEventListener('click', alTocar);
      observador?.disconnect();
    };
  }, [producto]);

  return (
    <>
      {PIXEL && /^\d{6,20}$/.test(PIXEL) && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL}');fbq('track','PageView');`}
        </Script>
      )}
      {GA4 && /^G-[A-Z0-9]{4,15}$/.test(GA4) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA4}');`}
          </Script>
        </>
      )}
    </>
  );
}
