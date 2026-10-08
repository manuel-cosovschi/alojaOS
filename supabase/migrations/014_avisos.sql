-- ============================================
-- Los avisos: qué se le dijo al huésped, y qué no
-- ============================================
-- Esta tabla existe antes que el primer mail, y a propósito.
--
-- Un mail es la clase de cosa que falla parcialmente y para siempre: la clave
-- del proveedor se vence, el dominio pierde su verificación, el huésped escribió
-- mal su dirección, el proveedor marca el mensaje como spam. Nada de eso tira
-- una excepción en el servidor, y ninguno se nota desde adentro, porque el que
-- no recibe el mail es el único que podría avisar y no sabe que tenía que
-- recibirlo.
--
-- El antecedente está en este mismo producto: el comprobante que se subía y no
-- se guardaba, durante meses, porque el error se ignoraba a propósito. El
-- argumento era bueno —un problema de almacenamiento no puede cortarle la
-- reserva a nadie— y acá vale igual: **un mail que no sale no puede cortar una
-- reserva.** Lo que no se puede es que nadie se entere.
--
-- Así que cada intento de aviso deja una fila. Si salió, dice cuándo. Si falló,
-- dice por qué. Y el panel puede mostrar «a este huésped no le llegó nada»,
-- que es la única forma de que el dueño lo sepa a tiempo para levantar el
-- teléfono.
--
-- Lo que esta tabla NO pretende: no es una cola ni un reintentador. Si hace
-- falta reintentar, se reintenta y la fila se actualiza. Una cola trae su propia
-- clase de problemas y todavía no hace falta.

CREATE TABLE IF NOT EXISTS avisos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id  UUID NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  -- Qué aviso es. Texto y no un enum: agregar un aviso nuevo no tiene que ser
  -- una migración, y el conjunto lo valida el código que los manda.
  tipo        TEXT NOT NULL,
  -- A dónde se mandó, como estaba en el momento de mandarlo. Se guarda aunque
  -- esté en la reserva porque el huésped puede corregir su mail después, y
  -- entonces la reserva diría una dirección y el aviso habría ido a otra.
  destino     TEXT,
  estado      TEXT NOT NULL CHECK (estado IN ('ENVIADO', 'FALLO', 'SIN_CONFIGURAR')),
  -- El error, como lo devolvió el proveedor. Para el dueño no sirve; para
  -- entender por qué dejaron de salir los mails, es lo único que sirve.
  error       TEXT,
  -- El id que devolvió el proveedor, para poder buscar el mensaje en su panel.
  id_externo  TEXT,
  intentos    SMALLINT NOT NULL DEFAULT 1 CHECK (intentos > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un aviso por tipo y por reserva. Reintentar actualiza la fila en vez de
  -- agregar otra: lo que importa es el estado actual, no el historial de
  -- intentos, y una tabla que crece con cada reintento esconde ese estado.
  CONSTRAINT un_aviso_por_tipo UNIQUE (reserva_id, tipo),

  -- Un ENVIADO sin fecha, o un FALLO sin motivo, es media verdad. Y media
  -- verdad acá es «parece que salió».
  CONSTRAINT fallo_con_motivo CHECK (estado <> 'FALLO' OR error IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS avisos_reserva_idx ON avisos (reserva_id);
-- Para la consulta que importa: qué avisos fallaron últimamente.
CREATE INDEX IF NOT EXISTS avisos_fallados_idx ON avisos (created_at DESC)
  WHERE estado <> 'ENVIADO';

CREATE TRIGGER avisos_updated_at BEFORE UPDATE ON avisos
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

ALTER TABLE avisos ENABLE ROW LEVEL SECURITY;

-- El dueño ve los avisos de sus reservas y de ninguna otra. Pasa por
-- `reservas`, que es donde vive el complejo: así la regla es una sola y no dos
-- que tienen que estar de acuerdo.
CREATE POLICY "miembros ven los avisos de sus reservas" ON avisos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reservas r
       WHERE r.id = avisos.reserva_id
         AND public.es_miembro(r.complejo_id)
    )
  );

-- Nadie escribe esta tabla con su sesión. La escribe el servidor después de
-- intentar mandar, con la clave de servicio, por `anotar_aviso()`.

-- ============================================
-- Anotar el resultado de un intento
-- ============================================
-- La llama el servidor después de intentar mandar, con lo que pasó. Nunca
-- antes: una fila escrita antes de mandar diría que el aviso salió mientras el
-- proveedor todavía no contestó.
CREATE OR REPLACE FUNCTION public.anotar_aviso(
  p_reserva UUID,
  p_tipo    TEXT,
  p_estado  TEXT,
  p_destino TEXT DEFAULT NULL,
  p_error   TEXT DEFAULT NULL,
  p_externo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_estado NOT IN ('ENVIADO', 'FALLO', 'SIN_CONFIGURAR') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'estado_desconocido', 'estado', p_estado);
  END IF;

  -- Un FALLO sin motivo lo rechaza la restricción, así que se pone uno antes de
  -- llegar ahí: que la fila exista con el estado correcto importa más que el
  -- texto, y una excepción acá cortaría el aviso de una reserva que está bien.
  IF p_estado = 'FALLO' AND (p_error IS NULL OR length(trim(p_error)) = 0) THEN
    p_error := 'el proveedor falló sin decir por qué';
  END IF;

  INSERT INTO avisos (reserva_id, tipo, destino, estado, error, id_externo)
  VALUES (p_reserva, p_tipo, p_destino, p_estado, p_error, p_externo)
  ON CONFLICT (reserva_id, tipo) DO UPDATE
    SET estado     = EXCLUDED.estado,
        destino    = EXCLUDED.destino,
        error      = EXCLUDED.error,
        id_externo = EXCLUDED.id_externo,
        intentos   = avisos.intentos + 1
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anotar_aviso(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anotar_aviso(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================
-- Qué le decimos al huésped, para armar el mail
-- ============================================
-- Todo en una consulta, y del lado de la base. La alternativa era que el
-- servidor junte la reserva, la unidad y el complejo con tres pedidos y arme el
-- mail con eso; tres pedidos que pueden quedar desfasados, y un lugar más donde
-- el importe se puede recalcular mal.
--
-- Sólo `service_role`: devuelve el nombre, el mail y el teléfono de una persona.
CREATE OR REPLACE FUNCTION public.datos_del_aviso(p_reserva UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'reserva_id', r.id,
    'estado', r.estado,
    'huesped', r.huesped_nombre,
    'email', r.huesped_email,
    'unidad', u.nombre,
    'check_in', r.check_in,
    'check_out', r.check_out,
    'noches', (r.check_out - r.check_in),
    'total', r.importe,
    -- La seña se calcula acá con el porcentaje del complejo, igual que en
    -- `crear_reserva`. Que el mail diga un número y la pantalla otro sería la
    -- peor forma de perder la confianza de alguien que está por transferir.
    'sena', round(r.importe * c.porcentaje_sena / 100.0),
    'vence_el', r.vence_el,
    'complejo', c.nombre,
    'slug', c.slug,
    'moneda', c.moneda,
    'zona_horaria', c.zona_horaria,
    'datos_transferencia', c.datos_transferencia,
    'whatsapp', c.whatsapp,
    'mail_del_complejo', c.email
  )
    FROM reservas r
    JOIN unidades  u ON u.id = r.unidad_id
    JOIN complejos c ON c.id = r.complejo_id
   WHERE r.id = p_reserva;
$$;

REVOKE EXECUTE ON FUNCTION public.datos_del_aviso(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.datos_del_aviso(UUID) TO service_role;

-- ============================================
-- A quién no le llegó el aviso
-- ============================================
-- Para el panel. La pregunta que contesta es «¿a quién tengo que escribirle
-- yo?», no «¿cuántos mails mandamos?».
--
-- Va con LEFT JOIN desde `reservas` y no mirando la tabla de avisos, y eso es
-- la parte que importa. Una consulta sobre `avisos` encuentra los que fallaron;
-- lo que NO encuentra es una reserva que no tiene ninguna fila, o sea una en la
-- que el mail no se intentó nunca —porque el proceso se cortó antes, porque el
-- código que lo manda no corrió, porque alguien lo desconectó sin darse
-- cuenta—.
--
-- Y «no se intentó» es indistinguible de «falló» para el huésped: en los dos
-- casos no sabe nada. Así que cuentan igual.
CREATE OR REPLACE FUNCTION public.avisos_que_no_salieron(p_complejo UUID)
RETURNS TABLE (
  reserva_id       UUID,
  tipo             TEXT,
  estado           TEXT,
  error            TEXT,
  intentos         SMALLINT,
  huesped_nombre   TEXT,
  huesped_telefono TEXT,
  huesped_email    TEXT,
  check_in         DATE,
  cuando           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT r.id,
           -- Qué aviso le corresponde según en qué estado está la reserva.
           CASE r.estado WHEN 'HOLD_TRANSFER' THEN 'sena_pendiente'
                         ELSE 'reserva_confirmada' END::TEXT,
           coalesce(a.estado, 'NO_INTENTADO')::TEXT,
           a.error,
           coalesce(a.intentos, 0::SMALLINT),
           r.huesped_nombre, r.huesped_telefono, r.huesped_email,
           r.check_in,
           coalesce(a.updated_at, r.created_at)
      FROM reservas r
      LEFT JOIN avisos a
             ON a.reserva_id = r.id
            AND a.tipo = CASE r.estado WHEN 'HOLD_TRANSFER' THEN 'sena_pendiente'
                                       ELSE 'reserva_confirmada' END
     WHERE r.complejo_id = p_complejo
       -- Sólo reservas vivas: a quien canceló o se le venció no hay que
       -- escribirle, y un bloqueo del dueño no tiene huésped.
       AND r.estado IN ('HOLD_TRANSFER', 'CONFIRMED')
       AND r.origen <> 'bloqueo'
       AND (a.id IS NULL OR a.estado <> 'ENVIADO')
     ORDER BY r.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.avisos_que_no_salieron(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.avisos_que_no_salieron(UUID) TO authenticated;
