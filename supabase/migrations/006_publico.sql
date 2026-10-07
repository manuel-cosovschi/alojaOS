-- ============================================
-- AlojaOS — qué ve un visitante cualquiera
-- ============================================
-- La página de reservas de un complejo la abre gente sin cuenta, y el navegador
-- lleva la clave anónima puesta. O sea: todo lo que el rol `anon` pueda leer es
-- público, le pregunte la página o se lo pregunte alguien a mano con curl.
--
-- La decisión de fondo: `anon` NO tiene SELECT sobre ninguna tabla. Lo público
-- se sirve por funciones que devuelven exactamente los campos que la página
-- necesita. Cuesta un poco más de código y evita la clase entera de errores
-- donde una columna nueva se publica sola: el día que alguien agregue
-- `notas_internas` a `complejos` o un campo de facturación, no se filtra,
-- porque la función no lo nombra.
--
-- Esto no es paranoia de más. El sistema viejo tenía este bug exacto y el
-- comentario quedó escrito en `availability.js`: reenviaba el payload crudo del
-- workflow "por si servía para debug", y cuando los bloqueos empezaron a llevar
-- nombre, teléfono y DNI del huésped, ese endpoint público los empezó a
-- publicar. `npm run aislamiento` existe para que no vuelva a pasar sin avisar.

-- ============================================
-- Todo lo que la página pública necesita, en una llamada
-- ============================================
-- Una sola función y no cinco porque la página los pide siempre juntos: sin los
-- precios no puede cotizar, sin las reglas no sabe qué fechas ofrecer, y sin las
-- unidades no tiene qué mostrar.
CREATE OR REPLACE FUNCTION public.complejo_publico(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',   c.id,
    'slug', c.slug,
    'nombre',       c.nombre,
    'nombre_corto', c.nombre_corto,
    'descripcion',  c.descripcion,
    'localidad', c.localidad,
    'provincia', c.provincia,
    'pais',      c.pais,
    'direccion', c.direccion,
    'lat', c.lat,
    'lng', c.lng,
    'whatsapp',  c.whatsapp,
    'instagram', c.instagram,
    'email',     c.email,
    'marca', jsonb_build_object(
      'color_principal', c.color_principal,
      'color_fondo',     c.color_fondo,
      'color_texto',     c.color_texto,
      'color_acento',    c.color_acento,
      'tipografia_titulos', c.tipografia_titulos,
      'tipografia_cuerpo',  c.tipografia_cuerpo,
      'logo_path', c.logo_path
    ),
    'moneda', c.moneda,
    'zona_horaria', c.zona_horaria,
    'porcentaje_sena', c.porcentaje_sena,
    'horas_vencimiento_sena', c.horas_vencimiento_sena,
    'reservas_habilitadas', c.reservas_habilitadas,

    'unidades', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', u.id,
               'codigo', u.codigo,
               'nombre', u.nombre,
               'capacidad_maxima', u.capacidad_maxima,
               'sugerencia_ocupacion', u.sugerencia_ocupacion
             ) ORDER BY u.orden, u.codigo)
        FROM unidades u
       WHERE u.complejo_id = c.id AND u.activa
    ), '[]'::jsonb),

    'calendario', (
      SELECT jsonb_build_object(
               'primera_fecha', cc.primera_fecha,
               'ultima_fecha',  cc.ultima_fecha,
               'minimo_noches', cc.minimo_noches
             )
        FROM config_calendario cc WHERE cc.complejo_id = c.id
    ),

    'bloques_fijos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'check_in', b.check_in, 'check_out', b.check_out, 'etiqueta', b.etiqueta
             ) ORDER BY b.check_in)
        FROM bloques_fijos b WHERE b.complejo_id = c.id
    ), '[]'::jsonb),

    'minimos_noches', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'desde', m.desde, 'hasta', m.hasta, 'noches', m.noches,
               'etiqueta', m.etiqueta, 'dias_checkin', m.dias_checkin
             ) ORDER BY m.desde)
        FROM minimos_noches m WHERE m.complejo_id = c.id
    ), '[]'::jsonb),

    'periodos_precio', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'desde', p.desde,
               'hasta', p.hasta,
               'etiqueta', p.etiqueta,
               'precios', coalesce((
                 SELECT jsonb_object_agg(u2.codigo, pu.precio)
                   FROM precios_unidad pu
                   JOIN unidades u2 ON u2.id = pu.unidad_id
                  WHERE pu.periodo_id = p.id AND u2.activa
               ), '{}'::jsonb)
             ) ORDER BY p.desde)
        FROM periodos_precio p WHERE p.complejo_id = c.id
    ), '[]'::jsonb)
  )
  FROM complejos c
  WHERE c.slug = lower(p_slug);
$$;

GRANT EXECUTE ON FUNCTION public.complejo_publico(TEXT) TO anon, authenticated;

-- ============================================
-- Estado de una reserva, para quien tiene el link
-- ============================================
-- El huésped vuelve a su página a ver si ya le aprobaron la seña. No hay login:
-- el id de la reserva es lo único que tiene, así que esto devuelve SÓLO estado y
-- vencimiento. Ni el nombre, ni el importe, ni nada que convierta un id
-- adivinado en una filtración de datos de otra persona.
CREATE OR REPLACE FUNCTION public.estado_reserva(p_reserva UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v JSONB;
BEGIN
  PERFORM public.liberar_vencidas();

  SELECT jsonb_build_object('estado', r.estado, 'vence_el', r.vence_el)
    INTO v
    FROM reservas r
   WHERE r.id = p_reserva;

  -- Un id que no existe y un id de otro contestan lo mismo: nada.
  RETURN coalesce(v, jsonb_build_object('estado', NULL, 'vence_el', NULL));
END;
$$;

GRANT EXECUTE ON FUNCTION public.estado_reserva(UUID) TO anon, authenticated;

-- ============================================
-- Sacarle a `anon` todo lo que Supabase le da de regalo
-- ============================================
-- Un proyecto nuevo de Supabase le da DML completo a `anon` y `authenticated`
-- sobre todo lo que aparezca en `public`. Con RLS puesto y sin policy para
-- anónimos ya no leen nada, pero el permiso de tabla queda ahí esperando a que
-- alguien agregue una policy para otra cosa y la abra sin querer.
REVOKE ALL ON TABLE complejos, unidades, complejo_miembros, reservas,
                    periodos_precio, precios_unidad,
                    config_calendario, bloques_fijos, minimos_noches,
                    objetivos_temporada
  FROM anon;

-- Y que las tablas nuevas no nazcan abiertas.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
