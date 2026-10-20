/**
 * La API de conversiones de Meta: el mismo evento, mandado desde el servidor.
 *
 * El píxel del navegador lo frena un bloqueador o Safari; el servidor no. Los
 * dos mandan el mismo `event_id` y Meta se queda con uno solo.
 *
 * Sin `META_CAPI_TOKEN` y `NEXT_PUBLIC_META_PIXEL_ID` no hace nada y lo dice.
 * Nunca se mandan el nombre, el teléfono ni el mail de la persona, ni siquiera
 * cifrados: sólo las cookies del píxel (`_fbp`, `_fbc`), el navegador y la
 * dirección de la página. Con eso Meta atribuye; sin datos de nadie.
 */

export async function eventoAMeta(params: {
  evento: 'Lead' | 'Purchase' | 'InitiateCheckout';
  eventId: string;
  url: string;
  fbp?: string;
  fbc?: string;
  navegador?: string;
  valor?: number;
  datos?: Record<string, string | number | undefined>;
}): Promise<{ enviado: boolean; motivo?: string }> {
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const token = process.env.META_CAPI_TOKEN?.trim();
  if (!pixel || !token) return { enviado: false, motivo: 'sin META_CAPI_TOKEN o píxel configurado' };

  const cuerpo = {
    data: [
      {
        event_name: params.evento,
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        action_source: 'website',
        event_source_url: params.url,
        user_data: {
          ...(params.fbp ? { fbp: params.fbp } : {}),
          ...(params.fbc ? { fbc: params.fbc } : {}),
          ...(params.navegador ? { client_user_agent: params.navegador } : {}),
        },
        custom_data: {
          ...params.datos,
          ...(params.valor ? { value: params.valor, currency: 'ARS' } : {}),
        },
      },
    ],
  };

  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(4000),
    });
    return r.ok ? { enviado: true } : { enviado: false, motivo: `Meta respondió ${r.status}` };
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : 'error de red' };
  }
}
