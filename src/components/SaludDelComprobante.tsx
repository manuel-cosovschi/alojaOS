import type { SaludDelComprobante as Salud } from '@/lib/salud';

/**
 * El cartel de «no podemos guardar comprobantes».
 *
 * Cuando todo anda, no muestra nada. No hay un tilde verde: el dueño no tiene
 * que aprender a leer un panel de monitoreo, tiene que enterarse cuando algo se
 * rompió. Un indicador en verde se vuelve parte del fondo en dos días y después
 * no se nota que se puso rojo.
 */
export function SaludDelComprobante({ salud }: { salud: Salud }) {
  if (salud.puede) return null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-semibold">Ahora mismo no podemos guardar comprobantes.</p>
      <p className="mt-2">
        El huésped puede reservar igual y la seña sigue viva: lo que no funciona
        es la subida de la foto de la transferencia. A él la pantalla se lo dice
        y le ofrece mandarla por WhatsApp, así que no se queda esperando. Pero si
        no te llega ningún comprobante por acá, el motivo es éste y no que no
        estén transfiriendo.
      </p>
      <p className="mt-2 opacity-90">{explicacion(salud)}</p>
      <p className="mt-2 text-xs opacity-70">
        Es un problema de configuración, no tuyo. Avisanos y lo arreglamos.
      </p>
    </div>
  );
}

function explicacion(salud: Salud): string {
  switch (salud.motivo) {
    case 'sin_clave':
      return 'Falta la clave de servicio en el servidor.';
    case 'clave_rechazada':
      return 'La clave de servicio está cargada pero el almacenamiento la rechaza. Lo más probable es que la hayan revocado o rotado.';
    case 'sin_bucket':
      return 'El lugar donde se guardan los comprobantes no existe o cambió de nombre.';
    default:
      return `El almacenamiento contestó un error: ${salud.detalle ?? 'sin detalle'}`;
  }
}
