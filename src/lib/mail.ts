/**
 * Mandar un mail, y dejar anotado si salió.
 *
 * ------------------------------------------------------------------
 * La regla de este archivo
 * ------------------------------------------------------------------
 * **Un mail que no sale no corta una reserva, y no se pierde en silencio.**
 *
 * Las dos mitades importan. La primera es obvia: el huésped ya reservó, la seña
 * ya está viva, y que el proveedor de mail esté caído no puede deshacer eso.
 * Era el argumento del sistema anterior con el comprobante, y era correcto.
 *
 * La segunda es la que faltaba allá. Cada intento deja una fila en `avisos`: si
 * salió, cuándo; si falló, por qué. El panel muestra los que no salieron, así
 * el dueño sabe a quién tiene que escribirle él. Sin eso, un proveedor que
 * empieza a rechazar todo se nota cuando un huésped se queja, que puede ser
 * nunca.
 *
 * ------------------------------------------------------------------
 * Resend, y qué pasa sin clave
 * ------------------------------------------------------------------
 * Sin `RESEND_API_KEY` esto no manda nada y anota `SIN_CONFIGURAR`. No tira, no
 * contesta que sí, y no rompe la reserva: queda registrado que ese huésped no
 * recibió nada. Es el estado honesto de un sistema al que todavía no le
 * cargaron el proveedor, y es visible en el panel igual que un fallo.
 *
 * Tampoco se usa el SDK: una llamada `fetch` a su API. Es un POST con tres
 * campos, y una dependencia menos es una dependencia que no hay que actualizar.
 */

import { clienteServicio } from '@/lib/supabase/servicio';

/** Los tipos de aviso que el sistema manda. */
export type TipoDeAviso = 'sena_pendiente' | 'reserva_confirmada' | 'sena_rechazada';

export interface Mail {
  a: string;
  asunto: string;
  texto: string;
  /** Quién figura como remitente. Tiene que ser de un dominio verificado. */
  de?: string;
  /** A dónde contesta el huésped si le da «responder»: el mail del complejo. */
  responderA?: string;
}

export type ResultadoAviso =
  | { estado: 'ENVIADO'; idExterno: string | null }
  | { estado: 'FALLO'; error: string }
  | { estado: 'SIN_CONFIGURAR'; error: string };

const API = 'https://api.resend.com/emails';

/**
 * El remitente por defecto.
 *
 * Tiene que ser un dominio verificado en Resend. Mientras no haya dominio,
 * `RESEND_DE` no está cargada, y entonces no se manda nada: mandar desde el
 * dominio de prueba del proveedor haría que el mail caiga en spam y que el
 * huésped vea una dirección que no es la del complejo. Peor que no mandarlo.
 */
function remitente(): string | null {
  return process.env.RESEND_DE || null;
}

/**
 * Manda el mail y anota el resultado. No tira nunca.
 *
 * Devuelve qué pasó, para que quien la llama pueda decidir si decir algo. Hoy
 * nadie lo usa para decidir nada —la reserva sigue su curso igual— y está bien
 * que el dato esté por si algún día hace falta.
 */
export async function avisar(
  reservaId: string,
  tipo: TipoDeAviso,
  mail: Mail
): Promise<ResultadoAviso> {
  const resultado = await mandar(mail);
  await anotar(reservaId, tipo, mail.a, resultado);
  return resultado;
}

async function mandar(mail: Mail): Promise<ResultadoAviso> {
  const clave = process.env.RESEND_API_KEY;
  const de = mail.de ?? remitente();

  if (!clave) {
    return {
      estado: 'SIN_CONFIGURAR',
      error: 'falta RESEND_API_KEY: no hay proveedor de mail configurado',
    };
  }
  if (!de) {
    return {
      estado: 'SIN_CONFIGURAR',
      error:
        'falta RESEND_DE: sin un dominio verificado no se manda, porque un mail ' +
        'desde el dominio de prueba del proveedor cae en spam y muestra una ' +
        'dirección que no es la del complejo',
    };
  }
  if (!mail.a || !mail.a.includes('@')) {
    return { estado: 'FALLO', error: `la dirección no parece un mail: ${mail.a}` };
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: de,
        to: [mail.a],
        subject: mail.asunto,
        text: mail.texto,
        ...(mail.responderA ? { reply_to: mail.responderA } : {}),
      }),
      // Sin esto, un proveedor que se cuelga cuelga la respuesta de la reserva.
      signal: AbortSignal.timeout(10_000),
    });

    const cuerpo = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;

    if (!res.ok) {
      return {
        estado: 'FALLO',
        error: `HTTP ${res.status}: ${cuerpo?.message ?? 'sin detalle'}`,
      };
    }

    return { estado: 'ENVIADO', idExterno: cuerpo?.id ?? null };
  } catch (e) {
    const texto = e instanceof Error ? e.message : String(e);
    return { estado: 'FALLO', error: texto.includes('timeout') ? 'el proveedor no contestó en 10 segundos' : texto };
  }
}

/**
 * Anota el intento en la base.
 *
 * Si esto falla, se registra en el log del servidor y se sigue. Es el único
 * lugar del archivo donde un error se traga, y el motivo es que la alternativa
 * es peor: tirar acá haría que un problema anotando el aviso rompa la pantalla
 * de una reserva que está bien. Lo que queda es una línea en el log, que es
 * menos de lo que uno quisiera pero más que nada.
 */
async function anotar(
  reservaId: string,
  tipo: TipoDeAviso,
  destino: string,
  resultado: ResultadoAviso
): Promise<void> {
  try {
    const servicio = clienteServicio();
    const { error } = await servicio.rpc('anotar_aviso', {
      p_reserva: reservaId,
      p_tipo: tipo,
      p_estado: resultado.estado,
      p_destino: destino,
      p_error: resultado.estado === 'ENVIADO' ? null : resultado.error,
      p_externo: resultado.estado === 'ENVIADO' ? resultado.idExterno : null,
    });
    if (error) {
      console.error(`[avisar] no pude anotar el aviso ${tipo} de ${reservaId}:`, error.message);
    }
  } catch (e) {
    console.error(`[avisar] no pude anotar el aviso ${tipo} de ${reservaId}:`, e);
  }

  if (resultado.estado !== 'ENVIADO') {
    console.error(
      `[avisar] el aviso ${tipo} de la reserva ${reservaId} no salió (${resultado.estado}): ${resultado.error}`
    );
  }
}
