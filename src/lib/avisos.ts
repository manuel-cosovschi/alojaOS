/**
 * Qué le decimos al huésped, y con qué palabras.
 *
 * Los textos están acá y no desperdigados en las acciones por un motivo
 * práctico: son lo que una persona va a leer en su casilla, posiblemente en el
 * celular, posiblemente apurada. Juntos se pueden leer de corrido y ver si
 * suenan como los escribiría el dueño o como los escribiría un sistema.
 *
 * Tres reglas de redacción, y las tres salen de lo mismo —que el que lee acaba
 * de darle plata a un desconocido por internet—:
 *
 *   1. **El dato primero, la cortesía después.** Cuánto, a dónde, hasta cuándo.
 *      Nadie abre este mail para que lo saluden.
 *   2. **Nada de «no responder a este mail».** El `reply_to` es el mail del
 *      complejo: si el huésped contesta, le contesta al dueño. Un mail del que
 *      no se puede salir es lo que hace que la gente llame por teléfono.
 *   3. **Texto plano.** No HTML. Un mail de HTML con la marca del complejo se
 *      ve mejor en la mitad de los clientes y peor en la otra mitad, y entra en
 *      spam más seguido. Lo que este mail tiene que lograr es que el número y la
 *      fecha lleguen.
 */

import type { Mail } from '@/lib/mail';

interface DatosDelAviso {
  complejo: string;
  huesped: string | null;
  unidad: string;
  checkIn: string;
  checkOut: string;
  noches: number;
  moneda: string;
  sena: number;
  total: number;
  venceEl: string;
  zonaHoraria: string;
  reservaId: string;
  datosTransferencia: string | null;
  whatsapp: string | null;
  mailDelComplejo: string | null;
  /** Dónde puede ver el estado de su reserva. */
  direccion: string | null;
}

const plata = (n: number, moneda: string) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(n);

/** Un día, en la zona del complejo y no en la de quien corre el servidor. */
const dia = (iso: string, zona: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: zona,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const diaYHora = (iso: string, zona: string) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: zona,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/** El saludo, que depende de si sabemos el nombre. */
const hola = (nombre: string | null) => (nombre ? `Hola ${nombre.split(' ')[0]},` : 'Hola,');

/** La firma: el complejo, y por dónde escribirle. */
function firma(d: DatosDelAviso): string {
  const lineas = [d.complejo];
  if (d.whatsapp) lineas.push(`WhatsApp: https://wa.me/${d.whatsapp}`);
  if (d.mailDelComplejo) lineas.push(d.mailDelComplejo);
  return lineas.join('\n');
}

/**
 * «Te guardamos la unidad, transferí la seña.»
 *
 * Es el mail que más importa de los tres, porque lleva un plazo. El vencimiento
 * va en el asunto: alguien que ve la casilla de reojo tiene que poder saber que
 * hay algo con fecha sin abrirlo.
 */
export function senaPendiente(d: DatosDelAviso): Mail {
  const vence = diaYHora(d.venceEl, d.zonaHoraria);

  const cuerpo = [
    hola(d.huesped),
    '',
    `Te guardamos ${d.unidad} del ${dia(d.checkIn, d.zonaHoraria)} al ${dia(d.checkOut, d.zonaHoraria)} ` +
      `(${d.noches} ${d.noches === 1 ? 'noche' : 'noches'}).`,
    '',
    `Seña a transferir: ${plata(d.sena, d.moneda)}`,
    `Total de la estadía: ${plata(d.total, d.moneda)}`,
    `Plazo: hasta el ${vence}`,
    '',
    d.datosTransferencia
      ? `Dónde transferir:\n${d.datosTransferencia}`
      : 'Escribinos y te pasamos los datos para transferir.',
    '',
    // Lo que el sistema anterior nunca le dio a nadie: una forma de verificar.
    d.direccion
      ? `Cuando transfieras, subí el comprobante acá y vas a ver en la pantalla que lo tenemos:\n${d.direccion}`
      : 'Cuando transfieras, mandanos el comprobante.',
    '',
    `Si el plazo pasa sin la transferencia, las fechas se liberan solas y no te cobramos nada.`,
    '',
    `Número de reserva: ${d.reservaId}`,
    '',
    firma(d),
  ].join('\n');

  return {
    a: '',
    asunto: `${d.complejo}: te guardamos ${d.unidad} hasta el ${vence}`,
    texto: cuerpo,
    responderA: d.mailDelComplejo ?? undefined,
  };
}

/** «Listo, está confirmada.» */
export function reservaConfirmada(d: DatosDelAviso): Mail {
  const cuerpo = [
    hola(d.huesped),
    '',
    `Recibimos la seña: tu reserva está confirmada.`,
    '',
    `${d.unidad}`,
    `Entrada: ${dia(d.checkIn, d.zonaHoraria)}`,
    `Salida: ${dia(d.checkOut, d.zonaHoraria)}`,
    `${d.noches} ${d.noches === 1 ? 'noche' : 'noches'}`,
    '',
    `Seña recibida: ${plata(d.sena, d.moneda)}`,
    `Saldo a pagar al llegar: ${plata(d.total - d.sena, d.moneda)}`,
    '',
    `Número de reserva: ${d.reservaId}`,
    '',
    `Cualquier cosa que necesites antes de venir, escribinos.`,
    '',
    firma(d),
  ].join('\n');

  return {
    a: '',
    asunto: `${d.complejo}: tu reserva está confirmada`,
    texto: cuerpo,
    responderA: d.mailDelComplejo ?? undefined,
  };
}

/**
 * «La seña no se aprobó.»
 *
 * Sin el motivo que escribió el dueño. Ese motivo es una nota interna —«no
 * llegó», «transfirió de menos»— escrita para él y no para una persona que está
 * recibiendo una mala noticia. Lo que sí lleva es una forma de preguntar.
 */
export function senaRechazada(d: DatosDelAviso): Mail {
  const cuerpo = [
    hola(d.huesped),
    '',
    `No pudimos confirmar tu reserva en ${d.unidad} para el ${dia(d.checkIn, d.zonaHoraria)}, ` +
      `y las fechas quedaron liberadas.`,
    '',
    `Si transferiste y esto te sorprende, escribinos: lo vemos y lo arreglamos.`,
    '',
    `Número de reserva: ${d.reservaId}`,
    '',
    firma(d),
  ].join('\n');

  return {
    a: '',
    asunto: `${d.complejo}: no pudimos confirmar tu reserva`,
    texto: cuerpo,
    responderA: d.mailDelComplejo ?? undefined,
  };
}

export type { DatosDelAviso };
