'use server';

/**
 * Una demo propia para cada visitante.
 *
 * Al tocar «Probá el demo» se crea una cuenta de usar y tirar, se copia el
 * complejo de ejemplo entero —unidades, temporadas, precios, señas— a un
 * complejo nuevo del que esa cuenta es dueña, y se abre la sesión. El visitante
 * entra al panel como cualquier dueño, y la guía lo lleva pantalla por
 * pantalla. Lo que haga es suyo: nadie más lo ve.
 *
 * La copia y la limpieza viven en la base (migración 025); acá queda lo que la
 * base no puede hacer: crear la cuenta en Auth, abrir la sesión, y borrar los
 * archivos que el visitante subió como huésped.
 *
 * El molde es el de GastroOS, que ya lo tenía andando.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { clienteConSesion } from '@/lib/supabase/sesion';
import { BUCKET_COMPROBANTES, clienteServicio } from '@/lib/supabase/servicio';
import { ipDeQuienPide } from '@/lib/ip';

/**
 * El dominio de los mails de las cuentas de demo.
 *
 * No recibe correo ni hace falta que exista: la cuenta se crea confirmada y
 * nunca se le manda nada. Es un dominio propio y no uno inventado para que,
 * si alguien mira la lista de usuarios, se entienda de una qué son. Y es el
 * que `limpiar_demos()` exige para borrar una cuenta: si cambia acá, cambia
 * allá, o la limpieza deja de llevarse las cuentas.
 */
const DOMINIO_DE_LAS_DEMOS = 'demo.alojaos.shop';

export type ResultadoDemo = { ok: false; mensaje: string };

const NO_SE_PUDO = 'No pudimos abrir la demo. Probá de nuevo en un momento, o escribinos y te la mostramos.';

/**
 * Borra del almacenamiento lo que haya bajo cada complejo.
 *
 * Son los comprobantes que el visitante subió jugando a ser huésped. La ruta es
 * `<complejo>/<reserva>/<archivo>`, así que hay que bajar dos niveles. El
 * comprobante de ejemplo de la plantilla vive en `demo/` y no se toca: es de
 * todas las demos.
 */
async function borrarArchivosDe(complejos: string[]): Promise<void> {
  if (complejos.length === 0) return;
  const servicio = clienteServicio();
  const almacen = servicio.storage.from(BUCKET_COMPROBANTES);

  for (const complejo of complejos) {
    const { data: reservas } = await almacen.list(complejo, { limit: 1000 });
    const rutas: string[] = [];
    for (const r of reservas ?? []) {
      const { data: archivos } = await almacen.list(`${complejo}/${r.name}`, { limit: 1000 });
      for (const a of archivos ?? []) rutas.push(`${complejo}/${r.name}/${a.name}`);
    }
    if (rutas.length > 0) {
      const { error } = await almacen.remove(rutas);
      // Se anota y se sigue: un archivo que quedó es basura, no un problema
      // del visitante, y cortar acá lo dejaría sin demo.
      if (error) console.error(`[demo] no pude borrar los archivos de ${complejo}:`, error.message);
    }
  }
}

/**
 * Entra a la demo.
 *
 * Si ya hay sesión de una demo vigente, vuelve a ella con lo que haya dejado.
 * Si la sesión es de un dueño de verdad, va a su panel: no se le arma nada.
 *
 * Nunca devuelve si sale bien: `redirect` funciona lanzando, así que queda
 * fuera de cualquier `try`.
 */
// El primer argumento es el estado anterior de `useActionState`: así el botón
// puede mostrar el error sin otra capa en el medio.
export async function entrarALaDemo(_previo?: unknown): Promise<ResultadoDemo | never> {
  let servicio: ReturnType<typeof clienteServicio>;
  try {
    servicio = clienteServicio();
  } catch (e) {
    console.error('[entrarALaDemo] sin clave de servicio:', e);
    return { ok: false, mensaje: NO_SE_PUDO };
  }

  const supabase = await clienteConSesion();
  const {
    data: { user: actual },
  } = await supabase.auth.getUser();

  if (actual) {
    const { data: suya } = await servicio.rpc('tocar_demo', { p_user: actual.id });
    if (suya) redirect('/panel?guia=1');

    const { count } = await servicio
      .from('complejo_miembros')
      .select('complejo_id', { count: 'exact', head: true })
      .eq('user_id', actual.id);
    if (count && count > 0) redirect('/panel');
    // Sesión sin complejo: una demo que venció y se limpió. Se cierra y se
    // arma una nueva con una cuenta nueva.
    await supabase.auth.signOut();
  }

  // Las demos abandonadas se van justo cuando importa: al armar la siguiente.
  const { data: limpieza, error: errorLimpieza } = await servicio.rpc('limpiar_demos');
  if (errorLimpieza) {
    console.error('[entrarALaDemo] no pude limpiar las demos viejas:', errorLimpieza.message);
  } else {
    const borrados = ((limpieza as { complejos?: string[] } | null)?.complejos ?? []) as string[];
    await borrarArchivosDe(borrados);
  }

  const ip = await ipDeQuienPide();
  const email = `demo-${randomUUID()}@${DOMINIO_DE_LAS_DEMOS}`;
  // Se usa una vez para abrir la sesión y se olvida. Quien vuelve lo hace con
  // su cookie, y si la pierde, «Probá el demo» le arma otra.
  const clave = randomBytes(24).toString('base64url');

  const { data: creado, error: errorAlta } = await servicio.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
    app_metadata: { alojaos_demo: true },
  });
  if (errorAlta || !creado?.user) {
    console.error('[entrarALaDemo] no pude crear la cuenta:', errorAlta?.message);
    return { ok: false, mensaje: NO_SE_PUDO };
  }

  const { data: copia, error: errorCopia } = await servicio.rpc('crear_demo', {
    p_user: creado.user.id,
    p_ip: ip,
  });
  const r = (copia ?? {}) as { ok?: boolean; motivo?: string; mensaje?: string };

  if (errorCopia || r.ok !== true) {
    console.error('[entrarALaDemo] no pude copiar la plantilla:', errorCopia?.message ?? JSON.stringify(copia));
    // La cuenta sin complejo no sirve y ensucia la lista de usuarios.
    await servicio.auth.admin.deleteUser(creado.user.id);
    return { ok: false, mensaje: r.motivo === 'muchas_demos' && r.mensaje ? r.mensaje : NO_SE_PUDO };
  }

  const { error: errorSesion } = await supabase.auth.signInWithPassword({ email, password: clave });
  if (errorSesion) {
    console.error('[entrarALaDemo] no pude abrir la sesión:', errorSesion.message);
    return { ok: false, mensaje: NO_SE_PUDO };
  }

  redirect('/panel?guia=1');
}

/**
 * Vuelve a empezar: tira esta demo y arma otra desde la plantilla.
 *
 * La demo invita a romper cosas, y después hay que poder volver atrás sin
 * borrar cookies ni entender qué pasó. La sesión se mantiene: es la misma
 * cuenta con un complejo nuevo.
 */
export async function reiniciarLaDemo(_previo?: unknown): Promise<ResultadoDemo | never> {
  const servicio = clienteServicio();
  const supabase = await clienteConSesion();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensaje: 'Tu sesión se cerró. Volvé a entrar a la demo.' };

  // Sólo se reinicia una demo. Un complejo de verdad no se borra por tocar un
  // botón, por más que ese botón no le aparezca nunca a su dueño.
  const { data: esDemo } = await servicio.from('demos').select('complejo_id').eq('user_id', user.id).maybeSingle();
  if (!esDemo) return { ok: false, mensaje: 'Esto no es una demo: no hay nada que reiniciar.' };

  const { data: borrados, error: errorBaja } = await servicio.rpc('tirar_demo', { p_user: user.id });
  if (errorBaja) {
    console.error('[reiniciarLaDemo] no pude tirar la demo:', errorBaja.message);
    return { ok: false, mensaje: 'No pudimos reiniciar la demo. Probá de nuevo en un momento.' };
  }
  await borrarArchivosDe((borrados as string[] | null) ?? []);

  // Sin IP: reiniciar no es abrir una demo nueva, y no tiene que gastar el
  // cupo de la persona que la está usando.
  const { data: copia, error: errorCopia } = await servicio.rpc('crear_demo', { p_user: user.id, p_ip: null });
  if (errorCopia || (copia as { ok?: boolean } | null)?.ok !== true) {
    console.error('[reiniciarLaDemo] no pude copiar la plantilla:', errorCopia?.message ?? JSON.stringify(copia));
    // Se queda sin complejo: el panel lo manda a entrar de nuevo, que le arma
    // otra. Feo, pero no deja a nadie encerrado.
    return { ok: false, mensaje: 'No pudimos reiniciar la demo. Entrá de nuevo desde alojaos.shop.' };
  }

  redirect('/panel?guia=1');
}

/**
 * Sale de la demo y la tira en el momento, con su cuenta.
 *
 * Si no, quedaría tres días esperando la limpieza con datos que el visitante
 * cargó jugando —a veces los suyos de verdad—.
 */
export async function salirDeLaDemo(): Promise<never> {
  const servicio = clienteServicio();
  const supabase = await clienteConSesion();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: esDemo } = await servicio.from('demos').select('complejo_id').eq('user_id', user.id).maybeSingle();
    if (esDemo) {
      const { data: borrados } = await servicio.rpc('tirar_demo', { p_user: user.id });
      await borrarArchivosDe((borrados as string[] | null) ?? []);
      await supabase.auth.signOut();
      // Después de cerrar la sesión: borrar la cuenta primero invalida el
      // token, y el signOut fallaría dejando la cookie puesta.
      if (user.email?.endsWith(`@${DOMINIO_DE_LAS_DEMOS}`)) {
        await servicio.auth.admin.deleteUser(user.id);
      }
      redirect('/#demo');
    }
    await supabase.auth.signOut();
  }
  redirect('/login');
}
