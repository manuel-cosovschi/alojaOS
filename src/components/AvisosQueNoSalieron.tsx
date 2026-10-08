import type { AvisoQueNoSalio } from '@/lib/panel';

/**
 * «A esta gente no le llegó el mail.»
 *
 * No es un panel de errores: es una lista de tareas. Cada fila es una persona a
 * la que hay que escribirle, con el botón de WhatsApp al lado, porque eso es lo
 * único que el dueño puede hacer al respecto.
 *
 * El motivo técnico va chico y al final. Al dueño no le sirve «HTTP 403: domain
 * not verified»; le sirve saber a quién llamar. Pero va, porque cuando nos
 * pregunte qué pasa, ese texto es lo único que lo explica.
 */
export function AvisosQueNoSalieron({
  avisos,
  zonaHoraria,
}: {
  avisos: AvisoQueNoSalio[];
  zonaHoraria: string;
}) {
  if (avisos.length === 0) return null;

  // Si TODOS son por falta de configuración, es un solo problema y no N
  // problemas: se dice una vez y no se repite por fila.
  const todosSinConfigurar = avisos.every((a) => a.estado === 'SIN_CONFIGURAR');

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">
        {avisos.length === 1
          ? 'A un huésped no le llegó el mail de su reserva.'
          : `A ${avisos.length} huéspedes no les llegó el mail de su reserva.`}
      </p>

      {todosSinConfigurar ? (
        <p className="mt-2">
          Todavía no está configurado el envío de mails, así que no salió ninguno.
          Es algo nuestro, no tuyo. Mientras tanto, estas son las personas a las
          que les conviene que les escribas:
        </p>
      ) : (
        <p className="mt-2">
          La reserva está bien y la seña sigue viva: lo único que falta es que
          sepan los datos para transferir. Escribiles vos:
        </p>
      )}

      <ul aria-label="Huéspedes a los que no les llegó el mail" className="mt-3 space-y-2">
        {avisos.map((a) => (
          <li
            key={`${a.reserva_id}-${a.tipo}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-amber-200/70 pt-2"
          >
            <span className="font-medium">{a.huesped_nombre ?? 'Sin nombre'}</span>
            <span className="opacity-70">
              entra el{' '}
              {new Date(`${a.check_in}T12:00:00Z`).toLocaleDateString('es-AR', {
                timeZone: zonaHoraria,
                day: '2-digit',
                month: '2-digit',
              })}
            </span>
            <span className="opacity-70">{etiqueta(a.tipo)}</span>
            {a.huesped_telefono && (
              <a
                className="underline"
                href={`https://wa.me/${a.huesped_telefono}`}
                target="_blank"
                rel="noopener"
              >
                WhatsApp
              </a>
            )}
            {!todosSinConfigurar && a.error && (
              <span className="basis-full text-xs opacity-60">{motivo(a)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function etiqueta(tipo: string): string {
  switch (tipo) {
    case 'sena_pendiente':
      return '· falta avisarle dónde transferir';
    case 'reserva_confirmada':
      return '· falta avisarle que está confirmada';
    default:
      return '';
  }
}

function motivo(a: AvisoQueNoSalio): string {
  if (a.estado === 'NO_INTENTADO') return 'No se llegó a intentar el envío.';
  return `${a.error} (${a.intentos} ${a.intentos === 1 ? 'intento' : 'intentos'})`;
}
