'use server';

/**
 * Lo que el dueño hace con una seña.
 *
 * ------------------------------------------------------------------
 * Quién decide que este dueño puede
 * ------------------------------------------------------------------
 * No este archivo. `aprobar_sena()` y `rechazar_sena()` son SECURITY DEFINER y
 * lo primero que hacen es `es_miembro(complejo_id)`; si no, levantan
 * `insufficient_privilege`. Así que el permiso se comprueba en la base, con la
 * sesión puesta, y no acá.
 *
 * Importa que sea así y no al revés: una pantalla que filtra bien y una base que
 * deja pasar todo es un bug a un `fetch` de distancia. La prueba de la base
 * tiene las dos aserciones —el vecino no puede aprobar ni rechazar una seña
 * ajena— y pasan porque la base lo impide, no porque la pantalla no lo ofrezca.
 *
 * ------------------------------------------------------------------
 * Ver el comprobante
 * ------------------------------------------------------------------
 * El bucket es privado y no tiene policies: nadie lo lee con su sesión, ni el
 * dueño. La URL firmada la arma el servidor con la clave de servicio, que
 * saltea RLS —y por lo tanto **acá sí hay que comprobar el permiso a mano**—.
 *
 * La comprobación es leer la reserva con el cliente CON SESIÓN primero. Si RLS
 * la devuelve, este usuario es miembro del complejo; si no, no. No se hace con
 * un `WHERE` escrito a mano: se delega en la misma policy que protege todo lo
 * demás, así no hay dos lugares que tengan que estar de acuerdo.
 */

import { clienteConSesion } from '@/lib/supabase/sesion';
import { BUCKET_COMPROBANTES, clienteServicio } from '@/lib/supabase/servicio';
import { programarAviso } from '@/actions/avisar';

export type Resultado = { ok: true; mensaje: string } | { ok: false; mensaje: string };

/** Cuántos segundos vive el enlace al comprobante. */
const VIDA_DEL_ENLACE = 120;

export async function aprobar(reservaId: string): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('aprobar_sena', { p_reserva: reservaId });

  if (error) {
    console.error('[aprobar] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return { ok: false, mensaje: motivoLegible(r) };
  }

  // Sólo si esta llamada la confirmó. Repetir el aviso porque el dueño apretó
  // dos veces le mandaría dos mails a la misma persona.
  if (r.ya_estaba !== true) {
    await programarAviso(reservaId, 'reserva_confirmada');
  }

  return {
    ok: true,
    mensaje: r.ya_estaba === true ? 'Ya estaba confirmada.' : 'Confirmada.',
  };
}

export async function rechazar(reservaId: string, motivo: string): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('rechazar_sena', {
    p_reserva: reservaId,
    p_motivo: motivo.trim() || null,
  });

  if (error) {
    console.error('[rechazar] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return { ok: false, mensaje: motivoLegible(r) };

  await programarAviso(reservaId, 'sena_rechazada');

  return { ok: true, mensaje: 'Rechazada. Las noches quedaron libres.' };
}

/**
 * Un enlace temporal al comprobante, o null.
 *
 * Devuelve null por las dos razones y no distingue: que la reserva no exista y
 * que sea de otro complejo contestan lo mismo. Si distinguiera, el id de una
 * reserva ajena serviría para saber que existe.
 */
export async function enlaceAlComprobante(reservaId: string): Promise<string | null> {
  const supabase = await clienteConSesion();

  // El permiso lo da RLS: si esta fila vuelve, el usuario es miembro.
  const { data: reserva, error } = await supabase
    .from('reservas')
    .select('comprobante_path')
    .eq('id', reservaId)
    .maybeSingle();

  if (error) {
    console.error('[enlaceAlComprobante] no pude leer la reserva:', error.message);
    return null;
  }
  if (!reserva?.comprobante_path) return null;

  let servicio: ReturnType<typeof clienteServicio>;
  try {
    servicio = clienteServicio();
  } catch (e) {
    console.error('[enlaceAlComprobante] no hay clave de servicio:', e);
    return null;
  }

  const { data, error: errorEnlace } = await servicio.storage
    .from(BUCKET_COMPROBANTES)
    .createSignedUrl(reserva.comprobante_path, VIDA_DEL_ENLACE);

  if (errorEnlace || !data?.signedUrl) {
    console.error('[enlaceAlComprobante] no pude firmar:', errorEnlace?.message);
    return null;
  }

  return data.signedUrl;
}

/**
 * El texto de un error de la base, traducido a algo que se pueda leer.
 *
 * El caso de la función que no existe está acá por algo que pasó de verdad: la
 * migración 016 quedó a medias en producción —el conector con el que la aplico
 * no pudo con dos de las cuatro funciones— y el panel, con el código nuevo
 * desplegado, le iba a decir al dueño «probá de nuevo en un minuto». Probar de
 * nuevo no iba a arreglar nada nunca.
 *
 * Es la clase de mentira que este sistema existe para no decir, y va a volver a
 * pasar cada vez que el código se despliegue antes que la migración. Así que el
 * mensaje dice qué es: falta algo de nuestro lado, no de tu lado.
 */
function mensajeDeError(mensaje: string): string {
  if (/insufficient_privilege|No tenés acceso/i.test(mensaje)) {
    return 'Esa reserva no es de tu complejo.';
  }
  if (/PGRST202|Could not find the function|schema cache/i.test(mensaje)) {
    return 'Esta parte todavía no está lista en el servidor. No es algo tuyo y volver a intentar no lo arregla: avisanos y lo dejamos andando.';
  }
  return 'No pudimos hacerlo. Probá de nuevo en un minuto.';
}

/** El motivo que devolvió la función, con palabras. */
function motivoLegible(r: Record<string, unknown>): string {
  switch (r.motivo) {
    case 'no_existe':
      return 'No encontramos esa reserva.';
    case 'no_espera_sena':
      return `Esa reserva ya no está esperando la seña (está ${r.estado}).`;
    case 'no_se_puede_rechazar':
      return `Esa reserva no se puede rechazar (está ${r.estado}).`;
    default:
      return 'No pudimos hacerlo.';
  }
}

/**
 * Cerrar fechas.
 *
 * Igual que aprobar y rechazar: el permiso lo comprueba `bloquear()` adentro,
 * con `es_miembro()`. Y el choque con una reserva vendida lo detecta la
 * restricción de exclusión al escribir, no una lectura previa.
 */
export async function cerrarFechas(
  complejoId: string,
  unidadId: string,
  desde: string,
  hasta: string,
  motivo: string
): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('bloquear', {
    p_complejo: complejoId,
    p_unidad: unidadId,
    p_desde: desde,
    p_hasta: hasta,
    p_motivo: motivo.trim() || null,
  });

  if (error) {
    console.error('[cerrarFechas] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    // Cuando choca, la base dice con qué. Para el dueño ese dato es la mitad
    // de la respuesta: si la cabaña está vendida esa semana, o llama al
    // huésped o cambia de fecha.
    const choca = r.choca_con as Record<string, unknown> | undefined;
    const base = typeof r.mensaje === 'string' ? r.mensaje : 'No pudimos cerrar esas fechas.';
    if (choca && typeof choca.check_in === 'string') {
      const quien =
        choca.estado === 'BLOCKED'
          ? `ya está cerrado${choca.motivo ? ` («${choca.motivo}»)` : ''}`
          : `lo tiene ${choca.huesped ?? 'un huésped'}`;
      return {
        ok: false,
        mensaje: `${base} Del ${choca.check_in} al ${choca.check_out} ${quien}.`,
      };
    }
    return { ok: false, mensaje: base };
  }

  return { ok: true, mensaje: 'Listo, esas fechas quedaron cerradas.' };
}

/**
 * Guardar un período de precios.
 *
 * `periodoId` null es un alta. Los precios van como `{unidad_id: texto}` y el
 * texto puede estar vacío: eso significa «esta unidad no tiene precio en este
 * tramo», que está permitido y queda visible en la salud de precios.
 *
 * No valida nada acá. `guardar_periodo()` comprueba el complejo con
 * `es_miembro()`, comprueba que cada unidad sea de ese complejo —hace falta,
 * porque es SECURITY DEFINER y RLS no corre adentro—, y el solape con otro
 * período lo decide la restricción al escribir. Repetir esas comprobaciones en
 * TypeScript daría dos lugares que tienen que estar de acuerdo, y el que manda
 * es el de abajo.
 */
export async function guardarPeriodo(
  complejoId: string,
  desde: string,
  hasta: string,
  precios: Record<string, string>,
  etiqueta: string,
  periodoId: string | null
): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('guardar_periodo', {
    p_complejo: complejoId,
    p_desde: desde,
    p_hasta: hasta,
    p_precios: precios,
    p_etiqueta: etiqueta.trim() || null,
    p_periodo: periodoId,
  });

  if (error) {
    console.error('[guardarPeriodo] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    const base = typeof r.mensaje === 'string' ? r.mensaje : 'No pudimos guardarlo.';
    const choca = r.choca_con as Record<string, unknown> | undefined;
    if (r.motivo === 'se_pisa' && choca && typeof choca.desde === 'string') {
      const nombre = choca.etiqueta ? `«${choca.etiqueta}»` : 'ese período';
      return {
        ok: false,
        mensaje: `${base} ${nombre} va del ${choca.desde} al ${choca.hasta}.`,
      };
    }
    return { ok: false, mensaje: base };
  }

  // Cuántas unidades quedaron sin precio es el dato que importa de la
  // respuesta: una unidad sin precio no se puede reservar, y el que acaba de
  // guardar es el único que puede arreglarlo ahora mismo.
  const conPrecio = Number(r.unidades_con_precio ?? 0);
  return {
    ok: true,
    mensaje:
      r.era_alta === true
        ? `Período cargado, ${r.noches} noches, ${conPrecio} ${conPrecio === 1 ? 'unidad' : 'unidades'} con precio.`
        : `Guardado. ${r.noches} noches, ${conPrecio} ${conPrecio === 1 ? 'unidad' : 'unidades'} con precio.`,
  };
}

/**
 * Borrar un período.
 *
 * Las reservas ya hechas no se tocan: guardan su propio importe cotizado. Lo
 * que se rompe son las noches futuras, y por eso el mensaje dice cuántas
 * quedaron sin precio en vez de un «listo» a secas.
 */
export async function borrarPeriodo(periodoId: string): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('borrar_periodo', { p_periodo: periodoId });

  if (error) {
    console.error('[borrarPeriodo] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      mensaje: (typeof r.mensaje === 'string' && r.mensaje) || 'No pudimos borrarlo.',
    };
  }

  const huecos = Number(r.noches_que_quedaron_sin_precio ?? 0);
  return {
    ok: true,
    mensaje:
      huecos > 0
        ? `Borrado. Ojo: quedaron ${huecos} ${huecos === 1 ? 'noche' : 'noches'} reservables sin precio.`
        : 'Borrado.',
  };
}

/**
 * Guardar la ventana de reservas y el mínimo general.
 *
 * Es lo único de todo el panel que arregla una falla que llega sola:
 * `ultima_fecha` se pasa con el calendario y, el día que pasa, la página deja
 * de ofrecer absolutamente todo. El mensaje de éxito dice las dos cosas que
 * siguen importando después de guardar —si la fecha quedó vencida igual, y si
 * la ventana nueva tiene noches sin precio—, porque las dos hacen que no se
 * pueda reservar y ninguna se ve en la pantalla del huésped.
 */
export async function guardarVentana(
  complejoId: string,
  ultima: string,
  minimo: number,
  primera: string | null
): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('guardar_config_calendario', {
    p_complejo: complejoId,
    p_ultima: ultima,
    p_minimo: minimo,
    p_primera: primera,
  });

  if (error) {
    console.error('[guardarVentana] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      mensaje: (typeof r.mensaje === 'string' && r.mensaje) || 'No pudimos guardarlo.',
    };
  }

  const huecos = Number(r.noches_sin_precio ?? 0);
  const partes = ['Guardado.'];
  if (r.ventana_vencida === true) {
    partes.push('Ojo: esa fecha ya pasó, así que la página sigue sin ofrecer nada.');
  } else {
    partes.push(`Se puede reservar hasta ${r.dias_hasta_el_cierre} días de hoy.`);
  }
  if (huecos > 0) {
    partes.push(
      `Y quedan ${huecos} ${huecos === 1 ? 'noche' : 'noches'} de esa ventana sin precio cargado: esas no se pueden reservar.`
    );
  }
  return { ok: true, mensaje: partes.join(' ') };
}

/**
 * Guardar un tramo con su mínimo de noches y sus días de entrada.
 *
 * `dias` vacío significa «cualquier día», y la base lo normaliza a NULL junto
 * con el caso de los siete días elegidos. No se normaliza acá: si estuviera en
 * los dos lados, serían dos lugares que tienen que estar de acuerdo.
 */
export async function guardarMinimo(
  complejoId: string,
  desde: string,
  hasta: string,
  noches: number,
  dias: number[],
  etiqueta: string,
  minimoId: string | null
): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('guardar_minimo', {
    p_complejo: complejoId,
    p_desde: desde,
    p_hasta: hasta,
    p_noches: noches,
    p_dias: dias.length > 0 ? dias : null,
    p_etiqueta: etiqueta.trim() || null,
    p_minimo: minimoId,
  });

  if (error) {
    console.error('[guardarMinimo] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return { ok: false, mensaje: deSolape(r, 'mínimo') };

  return {
    ok: true,
    mensaje:
      r.cualquier_dia === true
        ? 'Guardado. En ese tramo se puede entrar cualquier día.'
        : 'Guardado.',
  };
}

export async function borrarMinimo(minimoId: string): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('borrar_minimo', { p_minimo: minimoId });

  if (error) {
    console.error('[borrarMinimo] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      mensaje: (typeof r.mensaje === 'string' && r.mensaje) || 'No pudimos borrarlo.',
    };
  }

  // Sin esto, el dueño borra el tramo de enero creyendo que queda sin mínimo y
  // se encuentra con que se puede reservar una sola noche en temporada.
  const general = r.vuelven_al_minimo_general;
  return {
    ok: true,
    mensaje:
      general != null
        ? `Borrado. Esas noches vuelven al mínimo general de ${general}.`
        : 'Borrado.',
  };
}

/** Guardar un bloque que va entero. `check_out` es el día de salida. */
export async function guardarBloqueFijo(
  complejoId: string,
  checkIn: string,
  checkOut: string,
  etiqueta: string,
  bloqueId: string | null
): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('guardar_bloque_fijo', {
    p_complejo: complejoId,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_etiqueta: etiqueta.trim() || null,
    p_bloque: bloqueId,
  });

  if (error) {
    console.error('[guardarBloqueFijo] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return { ok: false, mensaje: deSolape(r, 'bloque') };

  return {
    ok: true,
    mensaje: `Guardado. Esas ${r.noches} noches van juntas o no van.`,
  };
}

export async function borrarBloqueFijo(bloqueId: string): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('borrar_bloque_fijo', { p_bloque: bloqueId });

  if (error) {
    console.error('[borrarBloqueFijo] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      mensaje: (typeof r.mensaje === 'string' && r.mensaje) || 'No pudimos borrarlo.',
    };
  }
  return { ok: true, mensaje: 'Borrado. Esas noches vuelven a venderse de a una.' };
}

/**
 * El mensaje de un solape, con el tramo con el que choca.
 *
 * Lo comparten los mínimos y los bloques porque la respuesta de la base tiene
 * la misma forma, y porque en los dos casos lo que el dueño necesita es el mismo
 * dato: cuál mover.
 */
function deSolape(r: Record<string, unknown>, que: string): string {
  const base = typeof r.mensaje === 'string' ? r.mensaje : 'No pudimos guardarlo.';
  const choca = r.choca_con as Record<string, unknown> | undefined;
  if (r.motivo !== 'se_pisa' || !choca) return base;

  const desde = choca.desde ?? choca.check_in;
  const hasta = choca.hasta ?? choca.check_out;
  if (typeof desde !== 'string' || typeof hasta !== 'string') return base;

  const nombre = choca.etiqueta ? `«${choca.etiqueta}»` : `el otro ${que}`;
  return `${base} ${nombre} va del ${desde} al ${hasta}.`;
}

/**
 * Guardar los datos del complejo.
 *
 * El campo que importa es `transferir`: sin él, el huésped reserva, ve cuánto
 * tiene que señar y no sabe a dónde mandarlo. El panel ya avisaba de eso y
 * mandaba a «los datos del complejo» —una pantalla que no existía—. Esto la
 * cierra.
 *
 * El slug no está entre los campos y no es un olvido: lo prohíbe un trigger
 * desde la 007, porque el dueño mandó el link de su página por WhatsApp a cada
 * huésped.
 *
 * `null` en un campo opcional significa «no lo toques»; la cadena vacía,
 * «borralo». Esa distinción la hace la base, no esto: acá se manda lo que el
 * formulario tenga.
 */
export async function guardarDatosDelComplejo(
  complejoId: string,
  nombre: string,
  whatsapp: string,
  transferir: string,
  localidad: string,
  email: string,
  porcentaje: number,
  horas: number
): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('guardar_datos_del_complejo', {
    p_complejo: complejoId,
    p_nombre: nombre,
    p_whatsapp: whatsapp,
    p_transferir: transferir,
    p_localidad: localidad,
    p_email: email,
    p_porcentaje: porcentaje,
    p_horas: horas,
  });

  if (error) {
    console.error('[guardarDatosDelComplejo] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      mensaje: (typeof r.mensaje === 'string' && r.mensaje) || 'No pudimos guardarlo.',
    };
  }

  // Lo que todavía falta y cuesta plata se dice acá, no sólo en el cartel de
  // arriba: el que acaba de guardar es el único que lo puede arreglar ahora.
  const falta: string[] = [];
  if (r.falta_donde_transferir === true) falta.push('dónde transferir');
  if (r.falta_whatsapp === true) falta.push('el WhatsApp');

  return {
    ok: true,
    mensaje:
      falta.length === 0
        ? 'Guardado.'
        : `Guardado, pero todavía falta ${falta.join(' y ')}. Sin eso el huésped reserva y no sabe cómo seguir.`,
  };
}

/**
 * Prender o apagar el alta pública.
 *
 * Aparte del formulario de datos porque es lo único de esa pantalla que cambia
 * lo que puede hacer un desconocido ahora mismo: apretarlo sin querer mientras
 * se corrige un teléfono sería dejar de vender sin saberlo.
 */
export async function habilitarReservas(
  complejoId: string,
  habilitar: boolean
): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('habilitar_reservas', {
    p_complejo: complejoId,
    p_habilitar: habilitar,
  });

  if (error) {
    console.error('[habilitarReservas] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return { ok: false, mensaje: 'No pudimos hacerlo.' };

  if (r.habilitadas !== true) {
    return { ok: true, mensaje: 'Listo: tu página ya no toma reservas.' };
  }

  // Prender con la casa a medio cargar es peor que no prender: la página queda
  // abierta, no deja reservar nada igual, y el dueño cree que está vendiendo.
  return {
    ok: true,
    mensaje:
      r.pero_no_se_puede_reservar === true
        ? 'Prendidas — pero ojo: todavía no se puede reservar nada. Mirá el aviso de precios y el de hasta cuándo se vende.'
        : 'Prendidas. Tu página ya toma reservas.',
  };
}

/** Guardar una unidad. `unidadId` null es un alta. */
export async function guardarUnidad(
  complejoId: string,
  codigo: string,
  nombre: string,
  capacidad: number,
  sugerencia: string,
  orden: number | null,
  activa: boolean,
  unidadId: string | null
): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('guardar_unidad', {
    p_complejo: complejoId,
    p_codigo: codigo,
    p_nombre: nombre,
    p_capacidad: capacidad,
    p_sugerencia: sugerencia,
    p_orden: orden,
    p_activa: activa,
    p_unidad: unidadId,
  });

  if (error) {
    console.error('[guardarUnidad] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      mensaje: (typeof r.mensaje === 'string' && r.mensaje) || 'No pudimos guardarla.',
    };
  }

  return {
    ok: true,
    mensaje: r.era_alta === true ? `Unidad ${r.codigo} agregada.` : 'Guardada.',
  };
}

/**
 * Borrar una unidad.
 *
 * La que tiene reservas no se borra: `reservas.unidad_id` es ON DELETE RESTRICT
 * y borrarla tiraría el historial de la plata que entró. La base lo traduce a
 * la frase que el dueño necesita —«sacala de circulación»—, que casi siempre es
 * lo que quiso decir el que apretó borrar.
 */
export async function borrarUnidad(unidadId: string): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('borrar_unidad', { p_unidad: unidadId });

  if (error) {
    console.error('[borrarUnidad] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      mensaje: (typeof r.mensaje === 'string' && r.mensaje) || 'No pudimos borrarla.',
    };
  }
  return { ok: true, mensaje: `${r.nombre} borrada.` };
}

/**
 * Guardar la marca: los cuatro colores y las dos tipografías.
 *
 * Las tipografías van por CLAVE (`serif`, `estrecha`…) y no por pila de CSS. Lo
 * que se guarda termina en el `font-family` del navegador de cada huésped, así
 * que el conjunto de valores aceptados es cerrado y lo decide la base.
 *
 * El contraste que vuelve es el que calculó la base. La pantalla también lo
 * calcula mientras el dueño mueve el color —si no, el aviso llegaría un guardado
 * tarde, que para elegir un color no sirve— y las dos cuentas están atadas por
 * pruebas que afirman los mismos valores.
 */
export async function guardarMarca(
  complejoId: string,
  principal: string,
  fondo: string,
  texto: string,
  acento: string,
  titulos: string | null,
  cuerpo: string | null
): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('guardar_marca', {
    p_complejo: complejoId,
    p_principal: principal,
    p_fondo: fondo,
    p_texto: texto,
    p_acento: acento,
    p_titulos: titulos,
    p_cuerpo: cuerpo,
  });

  if (error) {
    console.error('[guardarMarca] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      mensaje: (typeof r.mensaje === 'string' && r.mensaje) || 'No pudimos guardarlo.',
    };
  }

  // Un contraste bajo se guarda igual —es su página— pero se dice. La página se
  // ve bien en el monitor donde se eligió y no se lee en un celular al sol, y
  // el que no pudo leerla no escribe para avisar.
  const c = Number(r.contraste ?? 0);
  return {
    ok: true,
    mensaje:
      c > 0 && c < 4.5
        ? `Guardado. Ojo: el contraste entre tu texto y tu fondo es ${c}:1, y abajo de 4,5 cuesta leerlo en un celular al sol.`
        : 'Guardado. Así va a ver tu página el huésped.',
  };
}

/** Reabrir una fecha cerrada, por su id. */
export async function reabrirFecha(bloqueoId: string): Promise<Resultado> {
  const supabase = await clienteConSesion();
  const { data, error } = await supabase.rpc('reabrir', { p_bloqueo: bloqueoId });

  if (error) {
    console.error('[reabrirFecha] la base no dejó:', error.message);
    return { ok: false, mensaje: mensajeDeError(error.message) };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      mensaje:
        (typeof r.mensaje === 'string' && r.mensaje) ||
        (r.motivo === 'no_existe' ? 'Esa fecha ya no está cerrada.' : 'No pudimos reabrirla.'),
    };
  }

  return { ok: true, mensaje: 'Reabierta. Esas noches vuelven a estar a la venta.' };
}
