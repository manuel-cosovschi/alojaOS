import type { SaludDelVencimiento } from '@/lib/panel';

/**
 * ¿El vencimiento de las señas está corriendo?
 *
 * Esto está arriba en el panel, antes de las reservas, y no es un adorno de
 * monitoreo. En el sistema anterior el mecanismo que vencía las señas estuvo
 * muerto y nadie se enteró, porque la única forma de notarlo era que alguien
 * sumara a mano las señas viejas que seguían figurando. La pantalla se veía
 * perfecta.
 *
 * Así que el panel lo dice. Cuando está bien es una línea chica que casi no se
 * ve; cuando no, es un cartel. Esa asimetría es a propósito: un indicador verde
 * grande se mira dos días y después se vuelve parte del fondo.
 */
export function SaludDelReloj({ salud }: { salud: SaludDelVencimiento }) {
  if (salud.esta_bien) {
    return (
      <p className="text-xs opacity-50">
        El vencimiento de las señas corre solo, cada 5 minutos.
        {salud.esperando > 0 && ` ${salud.esperando} esperando transferencia.`}
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-semibold">Algo del vencimiento automático no está bien.</p>

      {/* Lo primero, porque es lo único que le cuesta plata al dueño: noches
          que figuran ocupadas por una seña que ya venció. */}
      {salud.atrasadas > 0 && (
        <p className="mt-2">
          Hay <strong>{salud.atrasadas}</strong>{' '}
          {salud.atrasadas === 1 ? 'seña vencida que sigue' : 'señas vencidas que siguen'} ocupando
          noches. Esas fechas no se le pueden ofrecer a nadie hasta que se
          liberen.
        </p>
      )}

      <p className="mt-2 opacity-90">{explicacion(salud)}</p>

      <p className="mt-2 text-xs opacity-70">
        Mientras esto pase, las señas vencidas se liberan igual cuando alguien
        entra a la página de reservas o cuando abrís este panel. Lo que no pasa
        es que se liberen solas si nadie entra.
      </p>
    </div>
  );
}

function explicacion(salud: SaludDelVencimiento): string {
  switch (salud.mecanismo) {
    case 'al_leer':
      return 'No hay ninguna tarea programada en la base: el vencimiento depende de que alguien lea o escriba.';
    case 'cron_apagado':
      return 'La tarea está programada pero apagada. Alguien la desactivó, o quedó así después de un cambio.';
    case 'cron':
      if (salud.nunca_corrio) {
        return 'La tarea está programada y activa pero nunca corrió. Si recién se programó, en 5 minutos esto se arregla solo; si no, no está corriendo.';
      }
      if (salud.fallas_ultimo_dia > 0) {
        return `La tarea corrió y falló ${salud.fallas_ultimo_dia} ${salud.fallas_ultimo_dia === 1 ? 'vez' : 'veces'} en el último día.`;
      }
      return `La tarea está activa pero su última corrida fue hace rato${salud.ultima_corrida ? ` (${salud.ultima_corrida})` : ''}.`;
    default:
      return 'No pudimos determinar qué mecanismo está activo.';
  }
}
