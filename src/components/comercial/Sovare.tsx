import Image from 'next/image';
import { NOCHE } from '@/lib/marca-alojaos';

/**
 * «Un producto de SOVARE», el mismo crédito que lleva el pie de GastroOS.
 *
 * El isotipo va como imagen y el nombre como texto, no como una sola imagen:
 * así se lee nítido en cualquier pantalla y queda en el HTML para buscadores y
 * lectores de pantalla. El isotipo es oscuro sobre transparente; el pie es
 * oscuro, así que se invierte.
 *
 * Con `NEXT_PUBLIC_SOVARE_PANEL_URL` cargada, el crédito es además la puerta al
 * panel interno de SOVARE, igual que en GastroOS: sin ninguna señal de que se
 * puede tocar —ni cursor de mano, ni foco con el teclado—, porque es un acceso
 * interno y que se note sólo invita a probarlo.
 */

const PANEL = process.env.NEXT_PUBLIC_SOVARE_PANEL_URL || '';

function Cuerpo() {
  return (
    <>
      <Image src="/marca/sovare-isotipo.webp" alt="" width={214} height={256} className="h-9 w-auto opacity-90 invert" />
      <div className="leading-tight">
        <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: NOCHE.textoSuave }}>
          Un producto de
        </p>
        <p className="text-sm font-semibold tracking-[0.28em] text-white">SOVARE</p>
        <p className="mt-0.5 text-[11px] italic" style={{ color: NOCHE.textoSuave }}>
          From where we come. For what comes next.
        </p>
      </div>
    </>
  );
}

export function CreditoSovare() {
  if (!PANEL) {
    return (
      <div className="flex items-center gap-3">
        <Cuerpo />
      </div>
    );
  }
  return (
    <a href={PANEL} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden className="flex cursor-default items-center gap-3">
      <Cuerpo />
    </a>
  );
}
