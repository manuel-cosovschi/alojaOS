'use server';

/**
 * Subir el comprobante de la seña.
 *
 * ------------------------------------------------------------------
 * La historia que ordena este archivo
 * ------------------------------------------------------------------
 * En el sistema anterior **ningún comprobante se guardó nunca**, desde el primer
 * día y durante meses. La subida contestaba "ok" y el archivo no llegaba: el
 * error de guardado se ignoraba a propósito, con el argumento razonable de que
 * un problema de almacenamiento no puede cortarle la reserva a un huésped. El
 * panel decía "sin comprobante" para todos y nadie supo por qué.
 *
 * El argumento original sigue siendo cierto, y la reserva de hecho no se cae: ya
 * está hecha y la seña sigue viva. Lo que NO se hace es decir que el comprobante
 * llegó cuando no llegó.
 *
 * El orden importa y es éste:
 *
 *   1. mirar en qué estado está la reserva (sin eso, se guardarían archivos de
 *      reservas vencidas o inexistentes);
 *   2. subir el archivo;
 *   3. registrarlo en la reserva;
 *   4. si el paso 3 falla, **borrar el archivo que subió el paso 2** — si no,
 *      quedan archivos con datos de una persona que ninguna fila nombra, y por
 *      lo tanto que nadie va a borrar nunca.
 *
 * Y el huésped puede verificarlo solo: `estado_reserva()` dice si el sistema lo
 * tiene. Eso es lo que hace que el bug no pueda durar meses.
 */

import { clienteServidor } from '@/lib/supabase/servidor';
import { BUCKET_COMPROBANTES, clienteServicio } from '@/lib/supabase/servicio';

/** Lo que el bucket acepta. Se valida acá también para poder explicar por qué. */
const TIPOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

const MAXIMO_BYTES = 8 * 1024 * 1024;

export type ResultadoComprobante =
  | { ok: true; reemplazo: boolean }
  | { ok: false; mensaje: string; motivo: string };

/** Mensajes para los motivos que la base devuelve sin texto propio. */
const MENSAJE: Record<string, string> = {
  no_existe: 'No encontramos esa reserva.',
  no_espera_sena: 'Esa reserva ya no está esperando la seña.',
  sin_archivo: 'No recibimos el archivo. Probá de nuevo.',
};

export async function subirComprobante(
  reservaId: string,
  archivo: File
): Promise<ResultadoComprobante> {
  if (!reservaId) {
    return { ok: false, motivo: 'sin_reserva', mensaje: 'Falta el número de reserva.' };
  }

  if (!archivo || archivo.size === 0) {
    return { ok: false, motivo: 'sin_archivo', mensaje: 'No recibimos el archivo. Probá de nuevo.' };
  }

  if (archivo.size > MAXIMO_BYTES) {
    return {
      ok: false,
      motivo: 'muy_grande',
      mensaje: 'El archivo pesa más de 8 MB. Sacale una foto más liviana o mandá el PDF.',
    };
  }

  if (!(TIPOS as readonly string[]).includes(archivo.type)) {
    return {
      ok: false,
      motivo: 'tipo_no_permitido',
      mensaje: 'Mandá una foto (JPG, PNG, WEBP o HEIC) o un PDF.',
    };
  }

  // ------------------------------------------------------------------
  // 1. En qué estado está la reserva
  // ------------------------------------------------------------------
  // Con la clave pública, que es la que corresponde: `estado_reserva` devuelve
  // sólo estado y vencimiento, y es lo único que hace falta para decidir si vale
  // la pena subir el archivo. Sin esto se guardarían archivos de reservas
  // vencidas o de ids inventados.
  const { data: estado, error: errorEstado } = await clienteServidor().rpc('estado_reserva', {
    p_reserva: reservaId,
  });

  if (errorEstado) {
    console.error('[subirComprobante] no se pudo leer el estado:', errorEstado.message);
    return {
      ok: false,
      motivo: 'error_base',
      mensaje: 'No pudimos verificar la reserva. Probá de nuevo en un minuto.',
    };
  }

  const e = (estado ?? {}) as Record<string, unknown>;

  if (!e.estado) {
    return { ok: false, motivo: 'no_existe', mensaje: MENSAJE.no_existe };
  }

  if (e.estado === 'EXPIRED') {
    return {
      ok: false,
      motivo: 'vencida',
      mensaje: 'Se pasó el plazo y las fechas se liberaron. Escribinos y lo vemos.',
    };
  }

  if (e.estado !== 'HOLD_TRANSFER') {
    return { ok: false, motivo: 'no_espera_sena', mensaje: MENSAJE.no_espera_sena };
  }

  // ------------------------------------------------------------------
  // 2. Subir el archivo
  // ------------------------------------------------------------------
  // Si falta la clave de servicio, `clienteServicio()` tira. Se atrapa acá a
  // propósito: una variable de entorno sin cargar es un problema de
  // configuración, no del huésped, y tiene que verse como "no pudimos
  // guardarlo" y no como una pantalla de error del servidor. Lo que NO puede
  // es verse como que salió bien.
  let servicio: ReturnType<typeof clienteServicio>;
  try {
    servicio = clienteServicio();
  } catch (e) {
    console.error('[subirComprobante] no se pudo crear el cliente de servicio:', e);
    return {
      ok: false,
      motivo: 'sin_configurar',
      mensaje: 'No pudimos guardar el comprobante. Probá de nuevo, o mandanoslo por WhatsApp.',
    };
  }

  // La ruta es `<complejo_id>/<reserva_id>/<archivo>`: el primer tramo es de
  // donde sale el permiso de lectura del dueño (policy en 011). El complejo se
  // lee del servidor, no se recibe, porque la ruta decide quién puede ver el
  // archivo y eso no lo elige quien sube.
  const { data: fila, error: errorFila } = await servicio
    .from('reservas')
    .select('complejo_id')
    .eq('id', reservaId)
    .single();

  if (errorFila || !fila) {
    console.error('[subirComprobante] no se pudo leer el complejo de la reserva:', errorFila?.message);
    return {
      ok: false,
      motivo: 'error_base',
      mensaje: 'No pudimos registrar el comprobante. Probá de nuevo en un minuto.',
    };
  }

  const extension = extensionDe(archivo);
  const ruta = `${fila.complejo_id}/${reservaId}/${Date.now()}${extension}`;

  const { error: errorSubida } = await servicio.storage
    .from(BUCKET_COMPROBANTES)
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });

  if (errorSubida) {
    // Acá es donde el sistema anterior contestaba "ok". No.
    console.error('[subirComprobante] falló la subida:', errorSubida.message);
    return {
      ok: false,
      motivo: 'fallo_subida',
      mensaje: 'No pudimos guardar el comprobante. Probá de nuevo, o mandanoslo por WhatsApp.',
    };
  }

  // ------------------------------------------------------------------
  // 3. Registrarlo en la reserva
  // ------------------------------------------------------------------
  const { data: registro, error: errorRegistro } = await servicio.rpc('registrar_comprobante', {
    p_reserva: reservaId,
    p_path: ruta,
  });

  const r = (registro ?? {}) as Record<string, unknown>;

  if (errorRegistro || r.ok !== true) {
    // 4. El archivo quedó subido y ninguna fila lo nombra. Se borra: un
    //    comprobante que nadie referencia es el dato bancario de una persona
    //    que nadie va a encontrar para borrar más adelante.
    const { error: errorBorrado } = await servicio.storage
      .from(BUCKET_COMPROBANTES)
      .remove([ruta]);

    if (errorBorrado) {
      // No se puede hacer mucho más que dejarlo anotado, pero anotarlo es la
      // diferencia entre un archivo huérfano que alguien puede encontrar y uno
      // que no.
      console.error(
        `[subirComprobante] quedó un archivo huérfano en ${BUCKET_COMPROBANTES}/${ruta}:`,
        errorBorrado.message
      );
    }

    console.error(
      '[subirComprobante] no se pudo registrar:',
      errorRegistro?.message ?? JSON.stringify(registro)
    );

    const motivo = typeof r.motivo === 'string' ? r.motivo : 'error_base';
    return {
      ok: false,
      motivo,
      mensaje:
        (typeof r.mensaje === 'string' && r.mensaje) ||
        MENSAJE[motivo] ||
        'No pudimos registrar el comprobante. Probá de nuevo en un minuto.',
    };
  }

  return { ok: true, reemplazo: r.reemplazo === true };
}

/** Dónde transferir, según lo que cargó el dueño. */
export async function datosParaTransferir(
  slug: string
): Promise<{ datos: string | null; whatsapp: string | null }> {
  const { data, error } = await clienteServidor().rpc('datos_para_transferir', { p_slug: slug });

  if (error) {
    console.error('[datosParaTransferir] la base devolvió un error:', error.message);
    return { datos: null, whatsapp: null };
  }

  const d = (data ?? {}) as Record<string, unknown>;
  return {
    datos: typeof d.datos_transferencia === 'string' ? d.datos_transferencia : null,
    whatsapp: typeof d.whatsapp === 'string' ? d.whatsapp : null,
  };
}

/** En qué quedó la seña, para que el huésped lo compruebe él mismo. */
export async function estadoDeLaSena(
  reservaId: string
): Promise<{ estado: string | null; venceEl: string | null; comprobante: boolean }> {
  const { data, error } = await clienteServidor().rpc('estado_reserva', { p_reserva: reservaId });

  if (error) {
    console.error('[estadoDeLaSena] la base devolvió un error:', error.message);
    return { estado: null, venceEl: null, comprobante: false };
  }

  const d = (data ?? {}) as Record<string, unknown>;
  return {
    estado: typeof d.estado === 'string' ? d.estado : null,
    venceEl: typeof d.vence_el === 'string' ? d.vence_el : null,
    comprobante: d.comprobante === true,
  };
}

/**
 * La extensión, deducida del tipo y no del nombre.
 *
 * El nombre del archivo lo elige quien sube, así que no se usa para armar la
 * ruta: un nombre con `../` o con caracteres raros decide dónde va a quedar
 * guardado el archivo, y eso no lo elige el visitante.
 */
function extensionDe(archivo: File): string {
  switch (archivo.type) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/heic':
      return '.heic';
    case 'image/heif':
      return '.heif';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}
