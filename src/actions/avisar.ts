'use server';

/**
 * Mandar el aviso que corresponde a una reserva.
 *
 * ------------------------------------------------------------------
 * Por qué con `after()` y no esperando
 * ------------------------------------------------------------------
 * `after()` de Next corre esto DESPUÉS de haberle contestado al navegador. El
 * huésped acaba de apretar «Reservar»: hacerlo esperar a que un proveedor de
 * mail en otro continente conteste —entre 300 ms y los 10 segundos del timeout—
 * para ver la pantalla de «te guardamos la unidad» es cambiar algo que le
 * importa por algo que no.
 *
 * El riesgo de `after()` es el de cualquier trabajo en segundo plano: si no
 * corre, nadie se entera. Y acá es peor que un mail perdido, porque no queda ni
 * la fila que diga que falló: queda una reserva sin ninguna fila de aviso.
 *
 * Eso está resuelto del otro lado, en la base: `avisos_que_no_salieron()` sale
 * de `reservas` con un LEFT JOIN, así que una reserva sin fila de aviso aparece
 * igual, como NO_INTENTADO. Para el huésped «no se intentó» y «falló» son lo
 * mismo —no sabe nada— y por lo tanto cuentan lo mismo.
 */

import { after } from 'next/server';
import { clienteServicio } from '@/lib/supabase/servicio';
import { avisar, type TipoDeAviso } from '@/lib/mail';
import { senaPendiente, reservaConfirmada, senaRechazada, type DatosDelAviso } from '@/lib/avisos';
import { direccionDelComplejo } from '@/lib/tenant';

/** Programa el aviso para después de contestarle al navegador. */
export async function programarAviso(reservaId: string, tipo: TipoDeAviso): Promise<void> {
  after(async () => {
    try {
      await mandarAviso(reservaId, tipo);
    } catch (e) {
      // `after()` no tiene a quién avisarle: lo único que se puede hacer es
      // dejarlo en el registro. La fila que falta la agarra el panel.
      console.error(`[programarAviso] el aviso ${tipo} de ${reservaId} se cayó:`, e);
    }
  });
}

async function mandarAviso(reservaId: string, tipo: TipoDeAviso): Promise<void> {
  const servicio = clienteServicio();
  const { data, error } = await servicio.rpc('datos_del_aviso', { p_reserva: reservaId });

  if (error || !data) {
    console.error(`[mandarAviso] no pude leer los datos de ${reservaId}:`, error?.message);
    return;
  }

  const d = data as Record<string, unknown>;
  const email = typeof d.email === 'string' ? d.email.trim() : '';

  if (!email) {
    // Sin mail no hay nada que mandar, y conviene que quede anotado: el dueño
    // tiene que saber que a ese huésped hay que escribirle por WhatsApp.
    await anotarQueNoHayMail(reservaId, tipo);
    return;
  }

  const slug = typeof d.slug === 'string' ? d.slug : '';
  const datos: DatosDelAviso = {
    complejo: String(d.complejo ?? ''),
    huesped: typeof d.huesped === 'string' ? d.huesped : null,
    unidad: String(d.unidad ?? ''),
    checkIn: String(d.check_in ?? ''),
    checkOut: String(d.check_out ?? ''),
    noches: Number(d.noches ?? 0),
    moneda: String(d.moneda ?? 'ARS'),
    sena: Number(d.sena ?? 0),
    total: Number(d.total ?? 0),
    venceEl: String(d.vence_el ?? ''),
    zonaHoraria: String(d.zona_horaria ?? 'America/Argentina/Buenos_Aires'),
    reservaId,
    datosTransferencia: typeof d.datos_transferencia === 'string' ? d.datos_transferencia : null,
    whatsapp: typeof d.whatsapp === 'string' ? d.whatsapp : null,
    mailDelComplejo: typeof d.mail_del_complejo === 'string' ? d.mail_del_complejo : null,
    direccion: slug ? direccionDelComplejo(slug) || null : null,
  };

  const plantilla =
    tipo === 'sena_pendiente'
      ? senaPendiente(datos)
      : tipo === 'reserva_confirmada'
        ? reservaConfirmada(datos)
        : senaRechazada(datos);

  await avisar(reservaId, tipo, { ...plantilla, a: email });
}

/** Deja anotado que no se pudo mandar porque no hay dirección. */
async function anotarQueNoHayMail(reservaId: string, tipo: TipoDeAviso): Promise<void> {
  try {
    const servicio = clienteServicio();
    await servicio.rpc('anotar_aviso', {
      p_reserva: reservaId,
      p_tipo: tipo,
      p_estado: 'FALLO',
      p_destino: null,
      p_error: 'la reserva no tiene mail del huésped',
      p_externo: null,
    });
  } catch (e) {
    console.error(`[anotarQueNoHayMail] ${reservaId}:`, e);
  }
}
