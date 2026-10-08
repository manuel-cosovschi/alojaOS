-- ============================================
-- AlojaOS — que la base cumpla lo que promete
-- ============================================
-- Se corre contra una base con las migraciones aplicadas:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/prueba-base.sql
--
-- Prueba las reglas que viven en la base, no en la app: la restricción que
-- impide dos reservas sobre la misma noche, la cotización por noche, las reglas
-- del calendario y el aislamiento entre complejos. Las de TypeScript están en
-- `src/lib/__tests__`; estas son las que no se pueden probar sin Postgres.
--
-- Deja la base como la encontró: todo pasa adentro de una transacción que se
-- revierte al final.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE resultado (n SERIAL, nombre TEXT, paso BOOLEAN, detalle TEXT);

CREATE OR REPLACE FUNCTION pg_temp.verificar(p_nombre TEXT, p_paso BOOLEAN, p_detalle TEXT DEFAULT '')
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO resultado (nombre, paso, detalle) VALUES (p_nombre, p_paso, p_detalle);
$$;

-- ============================================
-- Un complejo de prueba
-- ============================================
-- Nombres inventados a propósito: `npm run sin-marca` falla si acá apareciera
-- el nombre de un cliente de verdad.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'duenio@ejemplo.test'),
  ('22222222-2222-2222-2222-222222222222', 'ajeno@ejemplo.test');

INSERT INTO complejos (id, slug, nombre, localidad, whatsapp, mes_inicio_temporada,
                       porcentaje_sena, horas_vencimiento_sena, reservas_habilitadas)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'cabanias-del-sol', 'Cabañas del Sol',
        'Villa Ejemplo', '5490000000000', 12, 50, 6, true);

-- Un segundo complejo, para probar que no se ven entre ellos.
INSERT INTO complejos (id, slug, nombre, reservas_habilitadas)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'posada-vecina', 'Posada Vecina', true);

INSERT INTO complejo_miembros (complejo_id, user_id)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
       ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');

INSERT INTO unidades (id, complejo_id, codigo, nombre, capacidad_maxima, orden) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'U1', 'Unidad Uno', 4, 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'U2', 'Unidad Dos', 6, 2),
  -- La unidad del complejo vecino.
  ('bbbbbbbb-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000002', 'V1', 'Vecina Uno', 2, 1);

INSERT INTO config_calendario (complejo_id, primera_fecha, ultima_fecha, minimo_noches)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '2026-12-01', '2027-03-31', 2);

-- La ex-constante de temporada alta, ahora como dato.
INSERT INTO minimos_noches (complejo_id, desde, hasta, noches, etiqueta, dias_checkin)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '2026-12-20', '2027-03-01', 7,
        'temporada alta', ARRAY[6,0]::SMALLINT[]);

INSERT INTO bloques_fijos (complejo_id, check_in, check_out, etiqueta)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '2026-12-05', '2026-12-08', 'puente');

-- Dos períodos de precio pegados, con el corte en el medio de una estadía.
WITH p AS (
  INSERT INTO periodos_precio (complejo_id, desde, hasta, etiqueta) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', '2026-12-01', '2026-12-19', 'media'),
    ('aaaaaaaa-0000-0000-0000-000000000001', '2026-12-20', '2027-02-28', 'alta')
  RETURNING id, etiqueta
)
INSERT INTO precios_unidad (periodo_id, unidad_id, precio)
SELECT p.id, u.id,
       CASE WHEN p.etiqueta = 'media' THEN 80000 ELSE 150000 END
  FROM p CROSS JOIN unidades u
 WHERE u.complejo_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ============================================
-- 1. La restricción: nunca dos sobre la misma noche
-- ============================================
DO $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  -- Una reserva confirmada del 10 al 17 de enero.
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
          '2027-01-10', '2027-01-17', 'CONFIRMED', 'manual', 'Primera');

  -- La misma unidad, una noche encima: tiene que rebotar.
  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
            '2027-01-16', '2027-01-20', 'CONFIRMED', 'manual', 'Segunda');
    v_ok := false;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('una noche encima no entra', v_ok);

  -- Entrar el día que la otra se va: eso NO se pisa.
  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
            '2027-01-17', '2027-01-20', 'CONFIRMED', 'manual', 'Tercera');
    v_ok := true;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := false;
  END;
  PERFORM pg_temp.verificar('entrar el día que la otra se va, sí', v_ok);

  -- Las mismas fechas en OTRA unidad: no tienen nada que ver.
  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
            '2027-01-10', '2027-01-17', 'CONFIRMED', 'manual', 'Otra unidad');
    v_ok := true;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := false;
  END;
  PERFORM pg_temp.verificar('las mismas noches en otra unidad, sí', v_ok);

  -- Una cancelada no estorba: encima de las fechas de la primera, pero
  -- cancelada, y después una nueva sobre esas mismas fechas.
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
          '2027-02-01', '2027-02-05', 'CANCELLED', 'manual', 'Cancelada');
  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
            '2027-02-01', '2027-02-05', 'CONFIRMED', 'manual', 'Sobre la cancelada');
    v_ok := true;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := false;
  END;
  PERFORM pg_temp.verificar('una cancelada no ocupa', v_ok);

  -- Un bloqueo del dueño SÍ ocupa.
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
          '2027-02-10', '2027-02-14', 'BLOCKED', 'bloqueo');
  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
            '2027-02-12', '2027-02-16', 'CONFIRMED', 'manual', 'Sobre el bloqueo');
    v_ok := false;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('un bloqueo del dueño ocupa', v_ok);

  -- Mover las fechas de una reserva a donde hay otra: la restricción vale
  -- también para el UPDATE, que es lo que el sistema viejo chequeaba en un
  -- workflow aparte (y en un tercero no chequeaba).
  BEGIN
    UPDATE reservas SET check_in = '2027-01-12', check_out = '2027-01-15'
     WHERE huesped_nombre = 'Tercera';
    v_ok := false;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('mover fechas encima de otra tampoco', v_ok);
END $$;

-- ============================================
-- 2. Un HOLD vencido libera la noche
-- ============================================
DO $$
DECLARE
  v_ok BOOLEAN;
  v_cuantas INTEGER;
BEGIN
  -- Un hold que venció hace una hora.
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen,
                        huesped_nombre, vence_el)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
          '2027-03-01', '2027-03-05', 'HOLD_TRANSFER', 'web', 'No transfirió',
          now() - interval '1 hour');

  -- Mientras siga en HOLD_TRANSFER, ocupa.
  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
            '2027-03-02', '2027-03-04', 'CONFIRMED', 'manual', 'Encima del hold');
    v_ok := false;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('un hold vivo ocupa', v_ok);

  v_cuantas := public.liberar_vencidas();
  PERFORM pg_temp.verificar('liberar_vencidas() suelta el hold vencido', v_cuantas = 1,
                            format('soltó %s', v_cuantas));

  -- Ahora la noche está libre.
  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, huesped_nombre)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
            '2027-03-02', '2027-03-04', 'CONFIRMED', 'manual', 'Después del vencimiento');
    v_ok := true;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := false;
  END;
  PERFORM pg_temp.verificar('un hold vencido ya no ocupa', v_ok);

  -- Un hold sin vencimiento no se puede guardar: si pudiera, se quedaría con
  -- las noches para siempre. Esto es lo que pasaba con el cron apagado.
  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
            '2027-03-20', '2027-03-22', 'HOLD_TRANSFER', 'web');
    v_ok := false;
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('un hold sin vencimiento no se puede guardar', v_ok);
END $$;

-- ============================================
-- 3. Una unidad de otro complejo
-- ============================================
DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  BEGIN
    INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000009',
            '2027-01-10', '2027-01-12', 'CONFIRMED', 'manual');
    v_ok := false;
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('no se puede reservar la unidad de otro complejo', v_ok);
END $$;

-- ============================================
-- 4. Cotizar
-- ============================================
DO $$
DECLARE v JSONB;
BEGIN
  -- Del 18 al 22 de diciembre: dos noches a 80.000 y dos a 150.000.
  v := public.cotizar_estadia('bbbbbbbb-0000-0000-0000-000000000001', '2026-12-18', '2026-12-22');
  PERFORM pg_temp.verificar('cotiza cada noche por su fecha',
    (v->>'ok')::boolean AND (v->>'total')::numeric = 460000 AND (v->>'noches')::int = 4,
    v::text);

  PERFORM pg_temp.verificar('la seña es el porcentaje del complejo',
    (v->>'sena')::numeric = 230000, v->>'sena');

  -- Marzo no tiene período cargado: no se cotiza.
  v := public.cotizar_estadia('bbbbbbbb-0000-0000-0000-000000000001', '2027-02-26', '2027-03-03');
  PERFORM pg_temp.verificar('una noche sin precio deja la estadía sin cotizar',
    NOT (v->>'ok')::boolean AND v->>'motivo' = 'noche_sin_precio', v::text);

  -- Y dice qué noche falta.
  PERFORM pg_temp.verificar('y dice cuál es la primera noche sin precio',
    (v->>'noche')::date = '2027-03-01', v->>'noche');
END $$;

-- ============================================
-- 5. crear_reserva(): las reglas del calendario
-- ============================================
DO $$
DECLARE v JSONB;
BEGIN
  -- El 2/1/2027 es sábado: temporada alta, 7 noches, entrada sábado o domingo.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2027-01-02', '2027-01-09', 2::SMALLINT, 'Ana', '30111222', 'ana@ejemplo.test', '5490000000001');
  PERFORM pg_temp.verificar('sábado y 7 noches en temporada alta: entra',
    (v->>'ok')::boolean, v::text);
  PERFORM pg_temp.verificar('y nace como HOLD con vencimiento',
    (SELECT estado = 'HOLD_TRANSFER' AND vence_el IS NOT NULL FROM reservas WHERE id = (v->>'id')::uuid));
  PERFORM pg_temp.verificar('con el importe calculado por la base, no por el navegador',
    (SELECT importe = 7 * 150000 FROM reservas WHERE id = (v->>'id')::uuid),
    (SELECT importe::text FROM reservas WHERE id = (v->>'id')::uuid));

  -- Un lunes, con las mismas 7 noches.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2027-01-11', '2027-01-18', 2::SMALLINT, 'Beto', '30111333', 'beto@ejemplo.test', '5490000000002');
  PERFORM pg_temp.verificar('lunes en temporada alta: no', v->>'motivo' = 'dia_de_entrada', v::text);

  -- Sábado pero cinco noches.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2027-01-16', '2027-01-21', 2::SMALLINT, 'Caro', '30111444', 'caro@ejemplo.test', '5490000000003');
  PERFORM pg_temp.verificar('sábado pero 5 noches: no llega al mínimo',
    v->>'motivo' = 'pocas_noches', v::text);

  -- Antes de la ventana.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2026-11-10', '2026-11-13', 2::SMALLINT, 'Dani', '30111555', 'dani@ejemplo.test', '5490000000004');
  PERFORM pg_temp.verificar('antes de la primera fecha: no',
    v->>'motivo' = 'antes_de_la_ventana', v::text);

  -- La última noche reservable (31/3) se puede usar: salida el 1/4.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2027-03-29', '2027-04-01', 2::SMALLINT, 'Eli', '30111666', 'eli@ejemplo.test', '5490000000005');
  -- Marzo no tiene precio cargado, así que rebota por precio y no por ventana:
  -- lo que se prueba acá es justamente que NO rebotó por la ventana.
  PERFORM pg_temp.verificar('la última noche reservable no rebota por la ventana',
    v->>'motivo' IS DISTINCT FROM 'despues_de_la_ventana', v::text);

  -- Una noche más allá del tope.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2027-03-30', '2027-04-02', 2::SMALLINT, 'Fede', '30111777', 'fede@ejemplo.test', '5490000000006');
  PERFORM pg_temp.verificar('una noche más allá del tope: no',
    v->>'motivo' = 'despues_de_la_ventana', v::text);

  -- Parte de un bloque fijo.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2026-12-05', '2026-12-07', 2::SMALLINT, 'Gabi', '30111888', 'gabi@ejemplo.test', '5490000000007');
  PERFORM pg_temp.verificar('parte de un bloque fijo: no', v->>'motivo' = 'bloque_fijo', v::text);

  -- El bloque entero.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2026-12-05', '2026-12-08', 2::SMALLINT, 'Gabi', '30111888', 'gabi@ejemplo.test', '5490000000007');
  PERFORM pg_temp.verificar('el bloque fijo entero: sí', (v->>'ok')::boolean, v::text);

  -- Más personas que la capacidad.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000001',
        '2026-12-10', '2026-12-13', 9::SMALLINT, 'Hugo', '30111999', 'hugo@ejemplo.test', '5490000000008');
  PERFORM pg_temp.verificar('más personas que la capacidad: no', v->>'motivo' = 'capacidad', v::text);

  -- Sobre noches ya ocupadas: el camino público también rebota, y con un
  -- mensaje que se le puede mostrar a una persona.
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2027-01-03', '2027-01-10', 2::SMALLINT, 'Ivo', '30112000', 'ivo@ejemplo.test', '5490000000009');
  PERFORM pg_temp.verificar('sobre noches ocupadas: no', v->>'motivo' = 'ocupada', v::text);

  -- Con las reservas cerradas no entra nada.
  UPDATE complejos SET reservas_habilitadas = false WHERE slug = 'cabanias-del-sol';
  v := public.crear_reserva('cabanias-del-sol', 'bbbbbbbb-0000-0000-0000-000000000001',
        '2026-12-10', '2026-12-13', 2::SMALLINT, 'Juli', '30112111', 'juli@ejemplo.test', '5490000000010');
  PERFORM pg_temp.verificar('con las reservas cerradas: no', v->>'motivo' = 'reservas_cerradas', v::text);
  UPDATE complejos SET reservas_habilitadas = true WHERE slug = 'cabanias-del-sol';
END $$;

-- ============================================
-- 6. Lo público no publica al huésped
-- ============================================
DO $$
DECLARE
  v_claves TEXT[];
  v JSONB;
BEGIN
  SELECT array_agg(DISTINCT k) INTO v_claves
    FROM public.noches_ocupadas('aaaaaaaa-0000-0000-0000-000000000001') n,
         jsonb_object_keys(to_jsonb(n)) k;

  PERFORM pg_temp.verificar('las noches ocupadas no traen datos del huésped',
    v_claves <@ ARRAY['unidad_id','codigo','check_in','check_out'],
    array_to_string(v_claves, ', '));

  -- Y no publica las de otro complejo.
  PERFORM pg_temp.verificar('ni las de otro complejo',
    NOT EXISTS (
      SELECT 1 FROM public.noches_ocupadas('aaaaaaaa-0000-0000-0000-000000000001') n
       WHERE n.unidad_id = 'bbbbbbbb-0000-0000-0000-000000000009'
    ));

  -- El estado de una reserva: el estado, el vencimiento, y si el comprobante
  -- llegó. Nada más — y en particular NO la ruta del archivo, que es la
  -- dirección del comprobante de una persona.
  v := public.estado_reserva((SELECT id FROM reservas WHERE huesped_nombre = 'Ana' LIMIT 1));
  PERFORM pg_temp.verificar('el estado de una reserva no trae nada más',
    (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k)
      = ARRAY['comprobante','comprobante_subido_el','estado','vence_el'],
    v::text);
  PERFORM pg_temp.verificar('y nunca la ruta del archivo',
    NOT (v ? 'comprobante_path'), v::text);

  -- Un id que no existe contesta lo mismo que uno de otro: nada.
  v := public.estado_reserva('99999999-9999-9999-9999-999999999999');
  PERFORM pg_temp.verificar('un id inexistente no se distingue de uno ajeno',
    v->>'estado' IS NULL, v::text);
END $$;

-- ============================================
-- 7. Períodos y tramos que se pisan
-- ============================================
DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  BEGIN
    INSERT INTO periodos_precio (complejo_id, desde, hasta, etiqueta)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '2026-12-15', '2026-12-25', 'encimada');
    v_ok := false;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('dos períodos de precio no se pueden pisar', v_ok);

  -- Un período que arranca donde termina el otro SÍ se pisa, porque `hasta` es
  -- inclusivo: las dos filas reclaman esa noche.
  BEGIN
    INSERT INTO periodos_precio (complejo_id, desde, hasta, etiqueta)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '2026-12-19', '2026-12-19', 'justo el 19');
    v_ok := false;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('con `hasta` inclusivo, compartir un día es pisarse', v_ok);

  -- Pero el complejo vecino puede tener el período que quiera.
  BEGIN
    INSERT INTO periodos_precio (complejo_id, desde, hasta, etiqueta)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000002', '2026-12-01', '2027-03-31', 'la del vecino');
    v_ok := true;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := false;
  END;
  PERFORM pg_temp.verificar('los períodos de otro complejo no estorban', v_ok);

  BEGIN
    INSERT INTO minimos_noches (complejo_id, desde, hasta, noches)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '2027-01-01', '2027-01-31', 4);
    v_ok := false;
  EXCEPTION WHEN exclusion_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('dos tramos de mínimo no se pueden pisar', v_ok);
END $$;

-- ============================================
-- 8. El slug no se cambia
-- ============================================
DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  BEGIN
    UPDATE complejos SET slug = 'otro-nombre' WHERE slug = 'cabanias-del-sol';
    v_ok := false;
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('el slug no se puede cambiar', v_ok);
END $$;

-- ============================================
-- 9. La temporada
-- ============================================
DO $$
BEGIN
  PERFORM pg_temp.verificar('diciembre de 2026 es la temporada 2026',
    public.temporada_de('aaaaaaaa-0000-0000-0000-000000000001', '2026-12-15') = 2026);
  PERFORM pg_temp.verificar('enero de 2027 sigue siendo la 2026',
    public.temporada_de('aaaaaaaa-0000-0000-0000-000000000001', '2027-01-15') = 2026);
  PERFORM pg_temp.verificar('noviembre de 2026 es todavía la 2025',
    public.temporada_de('aaaaaaaa-0000-0000-0000-000000000001', '2026-11-30') = 2025);

  -- Y con otro mes de arranque, otra cuenta: la misma función, sin tocar código.
  UPDATE complejos SET mes_inicio_temporada = 6 WHERE slug = 'posada-vecina';
  PERFORM pg_temp.verificar('con arranque en junio, mayo es la temporada anterior',
    public.temporada_de('aaaaaaaa-0000-0000-0000-000000000002', '2026-05-31') = 2025);
  PERFORM pg_temp.verificar('y junio es la nueva',
    public.temporada_de('aaaaaaaa-0000-0000-0000-000000000002', '2026-06-01') = 2026);
END $$;

-- ============================================
-- 10. Un complejo no ve lo del otro (RLS)
-- ============================================
-- Se prueba con la sesión de un dueño de verdad, que es el caso que importa: no
-- un anónimo (eso lo cubre `npm run aislamiento`), sino el vecino, que SÍ tiene
-- cuenta y SÍ tiene permiso de lectura sobre la tabla.
DO $$
DECLARE
  v_propias INTEGER;
  v_ajenas  INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_ajenas FROM reservas
   WHERE complejo_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_propias FROM complejos;

  RESET ROLE;
  PERFORM pg_temp.verificar('el dueño del complejo vecino no ve ninguna reserva ajena',
    v_ajenas = 0, format('vio %s', v_ajenas));
  PERFORM pg_temp.verificar('ni el complejo ajeno', v_propias = 1, format('vio %s complejos', v_propias));
END $$;

-- ============================================
-- 11. Nada contesta que está bien sin estarlo
-- ============================================
-- De la auditoría del sistema anterior: todos sus errores devolvían éxito
-- mientras no hacían nada. Estas pruebas son contra esa forma, no contra un bug
-- concreto.
DO $$
DECLARE
  v_id     UUID;
  v_filas  INTEGER;
  v JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  -- Un hold que venció hace una hora, escrito directo en la tabla (como lo
  -- haría una importación o un camino que no pase por crear_reserva).
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen,
                        huesped_nombre, vence_el)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
          '2027-05-10', '2027-05-14', 'HOLD_TRANSFER', 'web', 'Dejó vencer',
          now() - interval '1 hour')
  RETURNING id INTO v_id;

  -- Leer la tabla con un filtro (lo que hacía el panel de allá) lo esconde: la
  -- pantalla diría "0 pendientes", que es lo mismo que diría si el vencimiento
  -- hubiera dejado de funcionar.
  -- Se cuenta esta fila y no todos los holds: bloques anteriores dejaron
  -- señas vivas, y contarlas haría que la prueba midiera otra cosa.
  SELECT count(*) INTO v_filas FROM reservas
   WHERE id = v_id AND estado = 'HOLD_TRANSFER' AND vence_el > now();
  PERFORM pg_temp.verificar('un filtro por vencimiento esconde el hold atrasado',
    v_filas = 0, 'justamente por eso el panel no se arma así');

  -- La función lo vence primero: lo que devuelve está vivo de verdad, y el
  -- atrasado quedó EXPIRED en vez de escondido.
  SELECT count(*) INTO v_filas
    FROM public.reservas_pendientes('aaaaaaaa-0000-0000-0000-000000000001') p
   WHERE p.id = v_id;
  PERFORM pg_temp.verificar('reservas_pendientes() no devuelve el atrasado', v_filas = 0);
  PERFORM pg_temp.verificar('porque lo venció en vez de esconderlo',
    (SELECT estado = 'EXPIRED' FROM reservas WHERE id = v_id),
    (SELECT estado::text FROM reservas WHERE id = v_id));

  -- Y la noche quedó libre, que es la consecuencia que importa.
  PERFORM pg_temp.verificar('y la noche quedó libre',
    NOT EXISTS (
      SELECT 1 FROM public.noches_ocupadas('aaaaaaaa-0000-0000-0000-000000000001')
       WHERE check_in = '2027-05-10'
    ));

  -- Un hold vivo sí aparece.
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen,
                        huesped_nombre, vence_el)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
          '2027-05-20', '2027-05-24', 'HOLD_TRANSFER', 'web', 'Está pagando',
          now() + interval '3 hours');
  SELECT count(*) INTO v_filas
    FROM public.reservas_pendientes('aaaaaaaa-0000-0000-0000-000000000001') p
   WHERE p.huesped_nombre = 'Está pagando';
  PERFORM pg_temp.verificar('un hold vivo sí aparece en pendientes', v_filas = 1,
    format('devolvió %s', v_filas));

  -- Y lo que devuelve está vivo: ninguna de las filas está atrasada. Esta es la
  -- afirmación que allá no se podía hacer.
  SELECT count(*) INTO v_filas
    FROM public.reservas_pendientes('aaaaaaaa-0000-0000-0000-000000000001') p
   WHERE p.vence_el < now();
  PERFORM pg_temp.verificar('ninguna de las pendientes está atrasada', v_filas = 0,
    format('%s atrasadas', v_filas));

  -- El testigo: la pregunta que allá no se podía contestar.
  v := public.salud_vencimientos('aaaaaaaa-0000-0000-0000-000000000001');
  PERFORM pg_temp.verificar('salud_vencimientos() no deja holds atrasados',
    (v->>'atrasadas')::int = 0, v::text);
  PERFORM pg_temp.verificar('y dice cuándo venció el último',
    v->>'ultimo_vencimiento' IS NOT NULL, v::text);

  -- Desbloquear distingue "no había nada" de "listo".
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
          '2027-06-01', '2027-06-05', 'BLOCKED', 'bloqueo');

  v := public.desbloquear('aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', '2027-06-02', '2027-06-04');
  PERFORM pg_temp.verificar('desbloquear dice cuántas desbloqueó',
    (v->>'desbloqueadas')::int = 1 AND (v->>'habia_algo')::boolean, v::text);

  -- Y la noche quedó libre: lo que allá contestaba "listo" sin hacerlo.
  PERFORM pg_temp.verificar('y la fecha quedó libre de verdad',
    NOT EXISTS (
      SELECT 1 FROM public.noches_ocupadas('aaaaaaaa-0000-0000-0000-000000000001')
       WHERE check_in = '2027-06-01'
    ));

  -- Desbloquear donde no hay nada no dice "listo": dice que no había nada.
  v := public.desbloquear('aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', '2027-09-01', '2027-09-05');
  PERFORM pg_temp.verificar('desbloquear donde no había nada lo dice',
    (v->>'desbloqueadas')::int = 0 AND NOT (v->>'habia_algo')::boolean, v::text);

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- El vecino no puede leer las pendientes de otro, aunque la función sea
-- SECURITY DEFINER y por lo tanto saltee las policies.
DO $$
DECLARE v_ok BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  BEGIN
    PERFORM count(*) FROM public.reservas_pendientes('aaaaaaaa-0000-0000-0000-000000000001');
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('el vecino no puede leer las pendientes ajenas', v_ok);

  BEGIN
    PERFORM public.desbloquear('aaaaaaaa-0000-0000-0000-000000000001',
      'bbbbbbbb-0000-0000-0000-000000000001', '2027-06-01', '2027-06-05');
    v_ok := false;
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni desbloquear fechas ajenas', v_ok);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- ============================================
-- 12. Los permisos dicen lo que parecen decir
-- ============================================
-- Esto no estaba, y por no estar se escapó un problema real: la migración 008
-- revocaba EXECUTE "de PUBLIC", que es de donde NO viene el permiso en Supabase
-- —viene de un GRANT explícito a `anon`, por las default privileges del
-- proyecto—. El arnés local no reproducía esa concesión, así que la prueba daba
-- bien y el proyecto de verdad tenía tres funciones abiertas a `anon` que no son
-- para él.
--
-- La lección no es "revisar mejor los GRANT": es que un permiso que importa se
-- afirma en una prueba, no en el comentario de al lado.
DO $$
DECLARE
  v_para_anon TEXT[];
  v_esperado  TEXT[];
BEGIN
  -- Quién puede ejecutar qué, leído de la base y no de las migraciones.
  --
  -- Enumera TODO `public`, no una lista de nombres escrita a mano. La lista a
  -- mano es lo que había antes, y dejó pasar tres funciones de trigger con
  -- EXECUTE concedido a PUBLIC durante diez migraciones: no estaban en la
  -- lista, así que nadie las miró. Lo encontró el verificador de producción,
  -- que sí enumeraba todo, y la migración 012 las cerró.
  --
  -- La lección es la de siempre acá: una prueba que mira lo que uno se acordó
  -- de anotar comprueba la memoria de uno, no la base.
  SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname), ARRAY[]::TEXT[])
    INTO v_para_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  -- La superficie pública del producto, completa y a propósito: la página de
  -- reservas no tiene sesión, así que estas cinco se llaman sin cuenta.
  v_esperado := ARRAY['complejo_publico','cotizar_estadia','crear_reserva',
                      'datos_para_transferir','estado_reserva','noches_ocupadas'];

  PERFORM pg_temp.verificar('`anon` puede ejecutar exactamente las públicas, y ninguna más',
    v_para_anon = v_esperado,
    format('puede: %s', array_to_string(v_para_anon, ', ')));

  -- La que escribe la ruta del comprobante en una reserva. Si `anon` pudiera,
  -- escribiría la ruta que quisiera en la reserva de cualquiera.
  PERFORM pg_temp.verificar('ni `anon` ni `authenticated` pueden registrar_comprobante()',
    NOT has_function_privilege('anon', 'public.registrar_comprobante(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.registrar_comprobante(uuid,text)', 'EXECUTE'));
  PERFORM pg_temp.verificar('pero `service_role` sí, que es quien sube el archivo',
    has_function_privilege('service_role', 'public.registrar_comprobante(uuid,text)', 'EXECUTE'));
  PERFORM pg_temp.verificar('`anon` no puede aprobar una seña',
    NOT has_function_privilege('anon', 'public.aprobar_sena(uuid)', 'EXECUTE'));
  PERFORM pg_temp.verificar('ni rechazarla',
    NOT has_function_privilege('anon', 'public.rechazar_sena(uuid,text)', 'EXECUTE'));

  -- Las que escriben o son del panel.
  PERFORM pg_temp.verificar('`anon` no puede ejecutar liberar_vencidas()',
    NOT has_function_privilege('anon', 'public.liberar_vencidas(uuid)', 'EXECUTE'));
  PERFORM pg_temp.verificar('ni reservas_pendientes()',
    NOT has_function_privilege('anon', 'public.reservas_pendientes(uuid)', 'EXECUTE'));
  PERFORM pg_temp.verificar('ni desbloquear()',
    NOT has_function_privilege('anon', 'public.desbloquear(uuid,uuid,date,date)', 'EXECUTE'));
  PERFORM pg_temp.verificar('ni es_miembro(), que es para las policies',
    NOT has_function_privilege('anon', 'public.es_miembro(uuid)', 'EXECUTE'));
  PERFORM pg_temp.verificar('ni complejo_de_unidad(), que mapea unidad a complejo',
    NOT has_function_privilege('anon', 'public.complejo_de_unidad(uuid)', 'EXECUTE'));

  -- `authenticated` sí necesita las del panel y las de las policies.
  PERFORM pg_temp.verificar('`authenticated` puede ejecutar reservas_pendientes()',
    has_function_privilege('authenticated', 'public.reservas_pendientes(uuid)', 'EXECUTE'));
  PERFORM pg_temp.verificar('y es_miembro(), que la llaman las policies',
    has_function_privilege('authenticated', 'public.es_miembro(uuid)', 'EXECUTE'));
  PERFORM pg_temp.verificar('pero no liberar_vencidas()',
    NOT has_function_privilege('authenticated', 'public.liberar_vencidas(uuid)', 'EXECUTE'));
END $$;

-- Ninguna función del proyecto sin `search_path` fijo: sin eso, resuelve los
-- nombres con el del invocador.
DO $$
DECLARE v_sueltas TEXT[];
BEGIN
  SELECT coalesce(array_agg(p.proname ORDER BY p.proname), ARRAY[]::TEXT[])
    INTO v_sueltas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     -- Todas, no una lista: la 010 movió btree_gist a `extensions` justamente
     -- para que en `public` no quede nada que no sea del producto. Si algún día
     -- aparece acá una función ajena, esta prueba lo dice en vez de omitirla.
     AND NOT EXISTS (
       SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::TEXT[])) c
        WHERE c LIKE 'search\_path=%'
     );

  PERFORM pg_temp.verificar('todas las funciones del proyecto fijan su search_path',
    v_sueltas = ARRAY[]::TEXT[], format('sin fijar: %s', array_to_string(v_sueltas, ', ')));
END $$;

-- Y la extensión fuera del esquema que se expone como API.
DO $$
DECLARE v_esquema TEXT;
BEGIN
  SELECT n.nspname INTO v_esquema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'btree_gist';
  PERFORM pg_temp.verificar('btree_gist no está en el esquema expuesto',
    v_esquema IS DISTINCT FROM 'public', format('está en %s', v_esquema));
END $$;

-- ============================================
-- 13. El comprobante de la seña
-- ============================================
-- En el sistema anterior los comprobantes NUNCA se guardaron: la subida
-- contestaba "ok", el archivo no llegaba, y nadie supo durante meses porque el
-- error se ignoraba a propósito. Estas pruebas son contra esa forma.
DO $$
DECLARE
  v_reserva UUID;
  v JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  -- Una seña viva, de las que esperan comprobante.
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen,
                        huesped_nombre, importe, vence_el)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
          '2027-07-10', '2027-07-14', 'HOLD_TRANSFER', 'web', 'Va a transferir', 400000,
          now() + interval '5 hours')
  RETURNING id INTO v_reserva;

  -- Antes de subir nada, el huésped ve que el sistema NO lo tiene. Esto es lo
  -- que hace que el bug viejo no pueda durar: se verifica solo.
  v := public.estado_reserva(v_reserva);
  PERFORM pg_temp.verificar('antes de subir, el estado dice que no hay comprobante',
    (v->>'comprobante')::boolean = false, v::text);

  -- Registrar sin ruta no registra nada.
  v := public.registrar_comprobante(v_reserva, '   ');
  PERFORM pg_temp.verificar('registrar sin archivo no dice que sí',
    NOT (v->>'ok')::boolean AND v->>'motivo' = 'sin_archivo', v::text);
  PERFORM pg_temp.verificar('y la reserva sigue sin comprobante',
    (SELECT comprobante_path IS NULL FROM reservas WHERE id = v_reserva));

  -- Con ruta, sí.
  v := public.registrar_comprobante(v_reserva,
        'aaaaaaaa-0000-0000-0000-000000000001/' || v_reserva || '/transferencia.jpg');
  PERFORM pg_temp.verificar('con archivo, queda registrado',
    (v->>'ok')::boolean AND NOT (v->>'reemplazo')::boolean, v::text);

  -- Y ahora el huésped lo ve.
  v := public.estado_reserva(v_reserva);
  PERFORM pg_temp.verificar('el huésped puede comprobar él mismo que llegó',
    (v->>'comprobante')::boolean AND v->>'comprobante_subido_el' IS NOT NULL, v::text);

  -- Pero NO la ruta: es la dirección del archivo de una persona.
  PERFORM pg_temp.verificar('el estado no publica dónde está guardado',
    NOT (v ? 'comprobante_path'), v::text);

  -- Volver a subir reemplaza, y lo dice. La primera foto sale mal seguido.
  v := public.registrar_comprobante(v_reserva,
        'aaaaaaaa-0000-0000-0000-000000000001/' || v_reserva || '/otra.jpg');
  PERFORM pg_temp.verificar('se puede volver a subir, y avisa que reemplazó',
    (v->>'ok')::boolean AND (v->>'reemplazo')::boolean, v::text);

  -- Media verdad no se puede guardar: ruta sin fecha, o fecha sin ruta.
  BEGIN
    UPDATE reservas SET comprobante_subido_el = NULL WHERE id = v_reserva;
    PERFORM pg_temp.verificar('no se puede dejar la ruta sin su fecha', false);
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.verificar('no se puede dejar la ruta sin su fecha', true);
  END;

  -- El dueño aprueba.
  v := public.aprobar_sena(v_reserva);
  PERFORM pg_temp.verificar('el dueño aprueba la seña', (v->>'ok')::boolean, v::text);
  PERFORM pg_temp.verificar('y la reserva queda confirmada, sin vencimiento colgado',
    (SELECT estado = 'CONFIRMED' AND vence_el IS NULL AND aprobada_el IS NOT NULL
       FROM reservas WHERE id = v_reserva));

  -- Aprobar de nuevo no duplica nada, y lo dice en vez de fingir que hizo algo.
  v := public.aprobar_sena(v_reserva);
  PERFORM pg_temp.verificar('aprobar dos veces lo dice en vez de fingir',
    (v->>'ok')::boolean AND (v->>'ya_estaba')::boolean, v::text);

  -- Una confirmada ya no espera seña.
  v := public.registrar_comprobante(v_reserva, 'x/y/z.jpg');
  PERFORM pg_temp.verificar('una confirmada no acepta otro comprobante',
    NOT (v->>'ok')::boolean AND v->>'motivo' = 'no_espera_sena', v::text);

  -- Y la noche sigue ocupada después de aprobar: la unidad no se liberó.
  PERFORM pg_temp.verificar('la noche sigue ocupada después de aprobar',
    EXISTS (
      SELECT 1 FROM public.noches_ocupadas('aaaaaaaa-0000-0000-0000-000000000001')
       WHERE check_in = '2027-07-10'
    ));

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- Un hold que venció no acepta comprobante, y lo dice con un motivo que se le
-- puede mostrar a una persona.
DO $$
DECLARE
  v_reserva UUID;
  v JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen,
                        huesped_nombre, vence_el)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
          '2027-08-10', '2027-08-14', 'HOLD_TRANSFER', 'web', 'Llegó tarde',
          now() - interval '2 hours')
  RETURNING id INTO v_reserva;

  v := public.registrar_comprobante(v_reserva, 'a/b/tarde.jpg');
  PERFORM pg_temp.verificar('un hold vencido no acepta comprobante',
    NOT (v->>'ok')::boolean AND v->>'motivo' = 'vencida', v::text);
  PERFORM pg_temp.verificar('y el mensaje es para una persona, no un código',
    length(coalesce(v->>'mensaje', '')) > 20, v->>'mensaje');

  -- Rechazar libera las noches.
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen,
                        huesped_nombre, vence_el)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
          '2027-09-10', '2027-09-14', 'HOLD_TRANSFER', 'web', 'Seña falsa',
          now() + interval '3 hours')
  RETURNING id INTO v_reserva;

  v := public.rechazar_sena(v_reserva, 'El comprobante era de otra transferencia.');
  PERFORM pg_temp.verificar('el dueño puede rechazar la seña', (v->>'ok')::boolean, v::text);
  PERFORM pg_temp.verificar('y las noches quedan libres',
    NOT EXISTS (
      SELECT 1 FROM public.noches_ocupadas('aaaaaaaa-0000-0000-0000-000000000001')
       WHERE check_in = '2027-09-10'
    ));
  PERFORM pg_temp.verificar('con el motivo guardado para el dueño',
    (SELECT motivo_rechazo IS NOT NULL FROM reservas WHERE id = v_reserva));

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- El vecino no puede aprobar ni rechazar lo ajeno.
DO $$
DECLARE
  v_ajena UUID;
  v_ok BOOLEAN;
BEGIN
  SELECT id INTO v_ajena FROM reservas
   WHERE complejo_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     AND estado = 'HOLD_TRANSFER' LIMIT 1;

  IF v_ajena IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
    BEGIN
      PERFORM public.aprobar_sena(v_ajena);
      v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
    END;
    PERFORM pg_temp.verificar('el vecino no puede aprobar una seña ajena', v_ok);

    BEGIN
      PERFORM public.rechazar_sena(v_ajena, 'no');
      v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
    END;
    PERFORM pg_temp.verificar('ni rechazarla', v_ok);
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END IF;
END $$;

-- ------------------------------------------------------------------
-- Los archivos: el bucket es privado y nadie los lee salvo el servidor
-- ------------------------------------------------------------------
-- La forma en que `storage.objects` queda cerrado es RLS prendido y CERO
-- policies. Eso hay que comprobarlo de las dos maneras, porque cada una sola
-- miente: RLS prendido con una policy permisiva abre todo, y cero policies con
-- RLS apagado también.
--
-- Y la cantidad de policies tiene que ser exactamente cero, no "ninguna para
-- `anon`". En un proyecto Supabase administrado la tabla es de
-- `supabase_storage_admin` y el rol de las migraciones no puede crear policies
-- ahí: una que aparezca en esta base existiría acá y no en producción, y las
-- pruebas estarían corriendo contra otra base. Si este bloque falla, lo que hay
-- que sacar es la policy, no la prueba.
DO $$
DECLARE
  v_publico BOOLEAN;
  v_policies INTEGER;
  v_rls BOOLEAN;
  v_limite BIGINT;
  v_tipos TEXT[];
BEGIN
  SELECT public, file_size_limit, allowed_mime_types
    INTO v_publico, v_limite, v_tipos
    FROM storage.buckets WHERE id = 'comprobantes';

  PERFORM pg_temp.verificar('el bucket de comprobantes es privado',
    v_publico = false, format('public = %s', v_publico));

  -- El límite y los tipos los hace cumplir el almacenamiento, no el navegador:
  -- la validación del formulario es para explicar, no para impedir.
  PERFORM pg_temp.verificar('el bucket no acepta más de 8 MB',
    v_limite = 8388608, format('%s bytes', v_limite));
  PERFORM pg_temp.verificar('el bucket sólo acepta imágenes y PDF',
    v_tipos @> ARRAY['image/jpeg', 'application/pdf']
    AND NOT (v_tipos @> ARRAY['text/html']), v_tipos::text);

  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE relname = 'objects' AND relnamespace = 'storage'::regnamespace;
  PERFORM pg_temp.verificar('storage.objects tiene RLS prendido',
    v_rls, format('relrowsecurity = %s', v_rls));

  SELECT count(*) INTO v_policies
    FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
  PERFORM pg_temp.verificar('no hay ninguna policy de archivos (ni para `anon` ni para el dueño)',
    v_policies = 0,
    format('%s policies: %s', v_policies,
      (SELECT coalesce(string_agg(policyname, ', '), '')
         FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects')));

  -- Lo que hace que el servidor sí pueda: BYPASSRLS. Si `anon` lo tuviera, todo
  -- lo de arriba daría igual.
  PERFORM pg_temp.verificar('sólo `service_role` pasa por encima de RLS',
    (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role')
    AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'anon')
    AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'authenticated'));
END $$;

-- ============================================
-- Resultado
-- ============================================
\echo ''
SELECT lpad(n::text, 2) || '  ' || CASE WHEN paso THEN 'OK    ' ELSE 'FALLA ' END || nombre ||
       CASE WHEN paso OR detalle = '' THEN '' ELSE E'\n        → ' || detalle END AS "prueba de la base"
  FROM resultado ORDER BY n;

\echo ''
SELECT count(*) FILTER (WHERE paso) || ' de ' || count(*) || ' pasaron' AS resumen FROM resultado;

DO $$
DECLARE v_fallas INTEGER;
BEGIN
  SELECT count(*) INTO v_fallas FROM resultado WHERE NOT paso;
  IF v_fallas > 0 THEN
    RAISE EXCEPTION '% pruebas fallaron', v_fallas;
  END IF;
END $$;

ROLLBACK;
