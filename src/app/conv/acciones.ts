'use server';

import { randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { clienteServicio } from '@/lib/supabase/servicio';
import { mandar } from '@/lib/mail';
import { MAIL_CONTACTO, MAIL_SIN_CARGAR } from '@/lib/constants';
import { atribucionDeCookie, COOKIE_ATRIBUCION, resumenDeAtribucion } from '@/lib/conv/atribucion';
import { eventoAMeta } from '@/lib/conv/meta-servidor';
import { TIPOS_DE_CONSULTA } from '@/lib/conv/consulta';

/**
 * La consulta de la página de conversión de AlojaOS.
 *
 * AlojaOS no se vende online: la puesta a punto la hacemos nosotros con los
 * precios y las unidades de cada complejo, y eso empieza con una charla. Así
 * que acá el objetivo es la consulta, y la consulta va a la tabla `consultas`
 * (migración 028), que sólo escribe el servidor.
 *
 * La regla: **`ok: true` sólo si la fila se guardó.** Si la base falla, el
 * visitante ve un error y reintenta. El mail de aviso va aparte: si no sale, la
 * consulta igual está guardada.
 */

export type ResultadoConsulta =
  | { ok: true; eventId: string }
  | { ok: false; error: string; campo?: 'nombre' | 'complejo' | 'contacto' };

const largo = (v: FormDataEntryValue | null, max: number) => String(v ?? '').trim().slice(0, max);
const ERROR_GENERAL = 'No pudimos recibir tu consulta. Probá de nuevo en un momento o escribinos por WhatsApp.';

export async function enviarConsulta(form: FormData): Promise<ResultadoConsulta> {
  // El campo trampa: invisible para una persona. Al robot se le dice que salió
  // bien, para que no aprenda a esquivarlo.
  if (largo(form.get('sitio_web'), 200)) return { ok: true, eventId: randomUUID() };

  const nombre = largo(form.get('nombre'), 120);
  const complejo = largo(form.get('complejo'), 160);
  const contacto = largo(form.get('contacto'), 160);
  const unidades = largo(form.get('unidades'), 40) || null;
  const tipoCrudo = largo(form.get('tipo'), 20);
  const tipo = (tipoCrudo in TIPOS_DE_CONSULTA ? tipoCrudo : 'demo') as keyof typeof TIPOS_DE_CONSULTA;
  const mensaje = largo(form.get('mensaje'), 1500) || null;

  if (nombre.length < 2) return { ok: false, error: 'Decinos tu nombre.', campo: 'nombre' };
  if (complejo.length < 2) return { ok: false, error: 'Decinos cómo se llama tu complejo.', campo: 'complejo' };

  const esMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contacto);
  const digitos = contacto.replace(/\D/g, '');
  const esTelefono = digitos.length >= 8 && digitos.length <= 15;
  if (!esMail && !esTelefono) {
    return { ok: false, error: 'Dejanos un WhatsApp o un mail para poder contestarte.', campo: 'contacto' };
  }

  const jar = await cookies();
  const origen = atribucionDeCookie(jar.get(COOKIE_ATRIBUCION)?.value);

  try {
    const { error } = await clienteServicio()
      .from('consultas')
      .insert({
        nombre,
        complejo,
        whatsapp: esTelefono ? contacto : null,
        email: esMail ? contacto.toLowerCase() : null,
        unidades,
        tipo,
        mensaje,
        origen,
      });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('[conv] no se pudo guardar la consulta:', e instanceof Error ? e.message : e);
    return { ok: false, error: ERROR_GENERAL };
  }

  const eventId = randomUUID();
  const h = await headers();
  const campania = resumenDeAtribucion(origen);

  // Lo que sigue no cambia la respuesta: la consulta ya está guardada.
  await Promise.allSettled([
    (async () => {
      const para = process.env.CONV_AVISO_A?.trim() || (MAIL_CONTACTO !== MAIL_SIN_CARGAR ? MAIL_CONTACTO : '');
      if (!para) return console.warn('[conv] consulta guardada sin aviso: falta CONV_AVISO_A o NEXT_PUBLIC_MAIL_CONTACTO');
      const r = await mandar({
        a: para,
        asunto: `Consulta de AlojaOS: ${complejo}`,
        texto: [
          `Nombre: ${nombre}`,
          `Complejo: ${complejo}`,
          `Contacto: ${contacto}`,
          unidades && `Unidades: ${unidades}`,
          `Pidió: ${TIPOS_DE_CONSULTA[tipo]}`,
          `Campaña: ${campania}${origen.variante ? ` · variante ${origen.variante}` : ''}`,
          mensaje && `\n${mensaje}`,
          '\nQuedó guardada en la tabla consultas de la base de AlojaOS.',
        ]
          .filter(Boolean)
          .join('\n'),
        ...(esMail ? { responderA: contacto } : {}),
      });
      if (r.estado !== 'ENVIADO') console.error('[conv] no salió el aviso:', r.error);
    })(),
    eventoAMeta({
      evento: 'Lead',
      eventId,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://alojaos.shop'}/conv`,
      fbp: jar.get('_fbp')?.value,
      fbc: jar.get('_fbc')?.value,
      navegador: h.get('user-agent') ?? undefined,
      datos: { producto: 'alojaos', tipo, utm_campaign: origen.utm_campaign },
    }),
  ]);

  return { ok: true, eventId };
}
