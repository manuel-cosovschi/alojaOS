/**
 * ¿Puede el sistema guardar un comprobante?
 *
 * ------------------------------------------------------------------
 * Por qué existe este archivo
 * ------------------------------------------------------------------
 * La clave de servicio es la que sube el archivo del comprobante y la que firma
 * la URL con la que el dueño lo mira. Si falta, está mal escrita o la revocaron,
 * pasa esto:
 *
 *   - el huésped reserva bien;
 *   - sube el comprobante y la pantalla le dice «no pudimos guardarlo», que es
 *     correcto y es mejor que mentirle;
 *   - **y el dueño no se entera de nada.** Para él simplemente no llegan
 *     comprobantes, que es indistinguible de que los huéspedes no transfieran.
 *
 * Eso último es el bug del sistema anterior con otra causa: meses sin un solo
 * comprobante guardado y nadie sabiendo por qué. Una clave que se revoca el día
 * que alguien rota credenciales lo reproduce entero.
 *
 * Así que el panel lo comprueba y lo dice. Y lo comprueba **pegándole al
 * almacenamiento**, no mirando si la variable de entorno está cargada: una clave
 * presente y revocada pasa cualquier chequeo de `process.env`.
 */

import { BUCKET_COMPROBANTES, clienteServicio } from '@/lib/supabase/servicio';

export interface SaludDelComprobante {
  puede: boolean;
  motivo: 'ok' | 'sin_clave' | 'clave_rechazada' | 'sin_bucket' | 'error';
  detalle: string | null;
}

export async function saludDelComprobante(): Promise<SaludDelComprobante> {
  let servicio: ReturnType<typeof clienteServicio>;
  try {
    servicio = clienteServicio();
  } catch (e) {
    return {
      puede: false,
      motivo: 'sin_clave',
      detalle: e instanceof Error ? e.message : null,
    };
  }

  // Una operación de verdad contra el bucket, lo más chica posible: listar un
  // archivo. Si la clave no sirve, esto rebota; si el bucket no existe,
  // también. Las dos cosas rompen el comprobante y las dos hay que verlas.
  const { error } = await servicio.storage.from(BUCKET_COMPROBANTES).list('', { limit: 1 });

  if (!error) return { puede: true, motivo: 'ok', detalle: null };

  const texto = error.message ?? '';
  const motivo: SaludDelComprobante['motivo'] = /not found|does not exist|Bucket not found/i.test(texto)
    ? 'sin_bucket'
    : /invalid|jwt|unauthorized|signature|api key/i.test(texto)
      ? 'clave_rechazada'
      : 'error';

  console.error('[saludDelComprobante] el almacenamiento no contesta bien:', texto);
  return { puede: false, motivo, detalle: texto };
}
