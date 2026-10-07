-- ============================================
-- AlojaOS — reservas, y la garantía de que no se superponen
-- ============================================
-- Esta es la migración que justifica haber movido los datos a Postgres.
--
-- En el sistema de Las Cañas el chequeo de superposición era esto, en un nodo
-- de JavaScript que leía la planilla entera:
--
--     const choque = filas.find((r) => ...
--       pedido.check_in < co && ci < pedido.check_out);
--     if (choque) return { ok: false, ... }
--     // ...y acá recién se escribía la fila
--
-- Mirar y después escribir. Entre las dos cosas entra otro: dos huéspedes que
-- aprietan "reservar" en el mismo segundo sobre la misma cabaña pasan los dos
-- el chequeo y se escriben los dos. Con la planilla no había forma de
-- arreglarlo, porque una planilla no sabe decir "no".
--
-- Acá la garantía la da la base: una restricción de exclusión sobre el rango de
-- noches. No hay lectura previa que pueda quedar vieja, no depende de que el
-- código se acuerde de chequear, y vale igual para el alta pública, la carga a
-- mano del dueño, el bloqueo y el cambio de fechas.

CREATE TYPE reserva_estado AS ENUM (
  'HOLD_TRANSFER',  -- pidió la reserva, tiene el lugar guardado hasta `vence_el`
  'CONFIRMED',      -- el dueño aprobó la seña
  'CANCELLED',
  'EXPIRED',        -- se le pasó el plazo de la transferencia
  'BLOCKED'         -- el dueño se guardó la unidad para él
);

CREATE TYPE reserva_origen AS ENUM ('web', 'manual', 'bloqueo', 'importada');

CREATE TABLE reservas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complejo_id UUID NOT NULL REFERENCES complejos(id) ON DELETE CASCADE,
  -- RESTRICT y no CASCADE: borrar una unidad que tiene reservas encima tiene
  -- que doler. Para sacarla de circulación está `unidades.activa`.
  unidad_id   UUID NOT NULL REFERENCES unidades(id) ON DELETE RESTRICT,

  -- Días de calendario, no instantes. Una noche no tiene hora, y guardarla
  -- como timestamp es cómo se arruinan las reservas en un servidor en UTC.
  check_in  DATE NOT NULL,
  check_out DATE NOT NULL,
  CHECK (check_in < check_out),

  estado reserva_estado NOT NULL DEFAULT 'HOLD_TRANSFER',
  origen reserva_origen NOT NULL DEFAULT 'web',

  -- Datos de quien reserva. Un bloqueo del dueño nace sin ninguno de estos y
  -- se pueden completar después: en Las Cañas los bloqueos quedaban sin datos
  -- y no había forma de cargarlos.
  huesped_nombre   TEXT,
  huesped_dni      TEXT,
  huesped_email    TEXT,
  huesped_telefono TEXT,
  personas         SMALLINT CHECK (personas IS NULL OR personas > 0),
  -- Los demás que se alojan, no sólo quien reserva.
  acompanantes     JSONB NOT NULL DEFAULT '[]'::jsonb,
  notas            TEXT,

  -- Plata. Van en la reserva y no en una tabla aparte porque son un dato de la
  -- estadía, y porque en el Excel de los dueños vivían en la misma fila.
  importe       NUMERIC(12,2) CHECK (importe IS NULL OR importe >= 0),
  anticipo      NUMERIC(12,2) CHECK (anticipo IS NULL OR anticipo >= 0),
  facturado     NUMERIC(12,2) CHECK (facturado IS NULL OR facturado >= 0),
  cotizacion_usd NUMERIC(12,4) CHECK (cotizacion_usd IS NULL OR cotizacion_usd > 0),
  -- El saldo no se guarda: es importe - anticipo, y un campo guardado que se
  -- puede calcular es un campo que algún día no va a coincidir.

  medio_pago     TEXT,
  referencia_pago TEXT,

  -- Hasta cuándo le guardamos el lugar. Sólo tiene sentido en HOLD_TRANSFER.
  vence_el     TIMESTAMPTZ,
  aprobada_el  TIMESTAMPTZ,
  cancelada_el TIMESTAMPTZ,
  motivo_estado TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Las noches que la reserva ocupa, como rango. Generada y guardada, para que
  -- la restricción no dependa de que alguien la mantenga al día.
  --
  -- '[)' — entrada incluida, salida excluida — es exactamente la regla del
  -- negocio: el día que uno se va es el día que entra el siguiente, y eso no
  -- se pisa. Con '[]' dos estadías consecutivas darían conflicto y el dueño
  -- perdería una noche por reserva.
  noches DATERANGE GENERATED ALWAYS AS (daterange(check_in, check_out, '[)')) STORED
);

-- ============================================
-- La restricción
-- ============================================
-- Nunca dos ocupaciones sobre la misma unidad y la misma noche.
--
-- El WHERE es la otra mitad de la regla: una cancelada o una vencida no
-- estorban, así que las fechas que liberan quedan libres de verdad. Es la
-- misma lista que el sistema viejo tenía repetida en cuatro lugares como
-- `OCUPAN = new Set([...])`, pero acá no se puede olvidar de aplicarla.
ALTER TABLE reservas ADD CONSTRAINT reservas_sin_superponer
  EXCLUDE USING gist (unidad_id WITH =, noches WITH &&)
  WHERE (estado IN ('HOLD_TRANSFER', 'CONFIRMED', 'BLOCKED'));

-- Un HOLD sin vencimiento no vence nunca y se queda con las noches para
-- siempre. Que la base lo exija es lo que hace que el error no sea posible.
ALTER TABLE reservas ADD CONSTRAINT hold_con_vencimiento
  CHECK (estado <> 'HOLD_TRANSFER' OR vence_el IS NOT NULL);

-- La unidad tiene que ser del mismo complejo que la reserva. Sin esto se podría
-- escribir una reserva de un complejo sobre la cabaña de otro, que es el peor
-- error posible en un sistema con varios clientes en la misma base.
CREATE OR REPLACE FUNCTION public.unidad_es_del_complejo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM unidades u
     WHERE u.id = NEW.unidad_id AND u.complejo_id = NEW.complejo_id
  ) THEN
    RAISE EXCEPTION 'La unidad no pertenece a ese complejo.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reservas_unidad_coherente
  BEFORE INSERT OR UPDATE OF unidad_id, complejo_id ON reservas
  FOR EACH ROW EXECUTE FUNCTION public.unidad_es_del_complejo();

CREATE TRIGGER reservas_tocar BEFORE UPDATE ON reservas
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

CREATE INDEX reservas_complejo_idx ON reservas (complejo_id, check_in DESC);
CREATE INDEX reservas_unidad_idx   ON reservas (unidad_id, check_in);
CREATE INDEX reservas_estado_idx   ON reservas (complejo_id, estado);
-- Para barrer los holds vencidos sin leer la tabla entera.
CREATE INDEX reservas_vencen_idx   ON reservas (vence_el)
  WHERE estado = 'HOLD_TRANSFER';

-- ============================================
-- Liberar los holds vencidos
-- ============================================
-- En Las Cañas esto era un cron de n8n, y el cron estaba APAGADO: el que
-- reservaba y no transfería se quedaba con las noches bloqueadas para siempre,
-- aunque el panel mostrara el contador en cero. El estado 'EXPIRED' existía y
-- nadie lo escribía nunca.
--
-- Acá el barrido no es la garantía, es una optimización: se llama también al
-- consultar disponibilidad y al crear una reserva, así que las noches se
-- liberan en el momento en que a alguien le importan. Si el programador de
-- tareas se apaga, el sistema sigue dando bien.
CREATE OR REPLACE FUNCTION public.liberar_vencidas(p_unidad UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuantas INTEGER;
BEGIN
  UPDATE reservas
     SET estado = 'EXPIRED',
         motivo_estado = coalesce(motivo_estado, 'Venció el plazo para transferir la seña.')
   WHERE estado = 'HOLD_TRANSFER'
     AND vence_el < now()
     AND (p_unidad IS NULL OR unidad_id = p_unidad);

  GET DIAGNOSTICS v_cuantas = ROW_COUNT;
  RETURN v_cuantas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.liberar_vencidas(UUID) FROM PUBLIC, anon;

-- ============================================
-- Qué noches están ocupadas
-- ============================================
-- Esto lo pide la página pública, sin login. Devuelve los rangos ocupados y
-- NADA más: ni el nombre, ni el teléfono, ni el DNI de quien los ocupa.
--
-- El sistema viejo ya había aprendido esto a los golpes. El comentario que
-- quedó en `availability.js` lo dice mejor de lo que lo diría yo: «una fecha
-- ocupada es pública, quién la ocupa no». Reenviaba el payload crudo de n8n
-- "por si servía para debug", y desde que los bloqueos llevaban datos del
-- huésped eso era una filtración esperando el día.
--
-- Por eso `reservas` no tiene ninguna policy para anónimos, y lo público es
-- esta función: el visitante no puede pedir una columna que no está acá.
CREATE OR REPLACE FUNCTION public.noches_ocupadas(
  p_complejo UUID,
  p_unidad   UUID DEFAULT NULL
)
RETURNS TABLE (unidad_id UUID, codigo TEXT, check_in DATE, check_out DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Antes de contestar, soltar lo que ya venció: si no, la página muestra
  -- ocupada una noche que en realidad está libre.
  PERFORM public.liberar_vencidas(p_unidad);

  RETURN QUERY
    SELECT r.unidad_id, u.codigo, r.check_in, r.check_out
      FROM reservas r
      JOIN unidades u ON u.id = r.unidad_id
     WHERE r.complejo_id = p_complejo
       AND r.estado IN ('HOLD_TRANSFER', 'CONFIRMED', 'BLOCKED')
       AND (p_unidad IS NULL OR r.unidad_id = p_unidad)
       -- Lo que ya pasó no le sirve a nadie para elegir fechas, y cuanto menos
       -- se publique, mejor.
       AND r.check_out >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
     ORDER BY u.orden, r.check_in;
END;
$$;

GRANT EXECUTE ON FUNCTION public.noches_ocupadas(UUID, UUID) TO anon, authenticated;

-- ============================================
-- RLS
-- ============================================
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

-- Los dueños ven y manejan las reservas de su complejo. Un anónimo no tiene
-- policy: no lee ni una fila, y para las fechas ocupadas está la función de
-- arriba.
CREATE POLICY "miembros manejan sus reservas" ON reservas
  FOR ALL USING (es_miembro(complejo_id)) WITH CHECK (es_miembro(complejo_id));
