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

-- La `reservas_pendientes` vieja: corrida a un costado y muerta para la API.
--
-- La 011 le agregó columnas de salida, y como Postgres no deja cambiarle el tipo
-- de retorno a una función existente, la vieja se renombró en vez de borrarse
-- (el conector con el que se aplica a producción no puede correr un `DROP`).
--
-- Acá se comprueba lo que esa maniobra tiene que dejar, y es importante que sea
-- en la base local: es la única corrida donde las migraciones se aplican de cero
-- y se puede ver que el renombre pasó de verdad, y no que la fila está en verde
-- porque la función no existe.
DO $$
DECLARE
  v_existe BOOLEAN;
  v_alcanzable BOOLEAN;
  v_nueva_ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'reservas_pendientes_sin_comprobante'
       AND pronamespace = 'public'::regnamespace
  ) INTO v_existe;
  PERFORM pg_temp.verificar('la reservas_pendientes vieja quedó corrida a un costado',
    v_existe);

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.proname = 'reservas_pendientes_sin_comprobante'
       AND p.pronamespace = 'public'::regnamespace
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) INTO v_alcanzable;
  PERFORM pg_temp.verificar('y no la puede llamar nadie por la API',
    NOT v_alcanzable);

  -- Y que el renombre dejó el nombre bueno con la función buena: si el nombre
  -- quedó libre y la nueva no se creó, lo de arriba pasa igual y el panel se
  -- queda sin la función que usa.
  SELECT 'comprobante_path' = ANY (proargnames) INTO v_nueva_ok
    FROM pg_proc WHERE proname = 'reservas_pendientes'
     AND pronamespace = 'public'::regnamespace;
  PERFORM pg_temp.verificar('y reservas_pendientes() quedó con el comprobante',
    coalesce(v_nueva_ok, false));
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
-- 14. El reloj del vencimiento
-- ============================================
-- `liberar_vencidas()` corre al leer y al escribir, y eso cubre lo que importa:
-- nadie puede tomar unas noches que un hold vencido figure ocupando. Lo que no
-- cubre es que nadie entre: ahí el hold no vence y las noches quedan tomadas.
--
-- La 013 programa un job de pg_cron para eso. Acá pg_cron no existe —hay que
-- compilarlo aparte— así que lo que se comprueba es lo que SÍ se puede
-- comprobar en cualquier parte, y resulta que es lo más importante:
--
--   - que la función diga la verdad sobre qué mecanismo está vivo, en vez de
--     suponer que hay uno;
--   - y que `atrasadas` cuente de verdad, porque es el único número que no
--     miente: si no es 0, el reloj está muerto, sea cual sea.
DO $$
DECLARE
  v JSONB;
  v_unidad UUID := 'bbbbbbbb-0000-0000-0000-000000000002';
BEGIN
  v := public.salud_del_vencimiento();

  -- Sin pg_cron tiene que decir 'al_leer'. Que diga 'cron' acá sería la
  -- mentira que esta función existe para no decir.
  PERFORM pg_temp.verificar('sin pg_cron, dice que el vencimiento corre al leer',
    v->>'mecanismo' = 'al_leer', v::text);
  PERFORM pg_temp.verificar('y por lo tanto NO dice que está bien',
    (v->>'esta_bien')::boolean = false, v::text);
  -- `nunca_corrio` es sobre el job, y acá no hay job: tiene que ser false, no
  -- true. Decir «nunca corrió» de algo que no existe confundiría las dos cosas.
  PERFORM pg_temp.verificar('ni dice que un job que no existe nunca corrió',
    (v->>'nunca_corrio')::boolean = false, v::text);

  -- Y ahora el número que no miente. Se planta un hold ya vencido, escribiendo
  -- la fila directo para saltearse las funciones que lo vencerían: es la forma
  -- de simular «nadie entró a la página».
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado,
                        origen, huesped_nombre, huesped_telefono, personas,
                        importe, vence_el)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', v_unidad,
          '2027-03-10', '2027-03-14', 'HOLD_TRANSFER', 'web',
          'Seña que nadie vino a mirar', '5491100001111', 2, 100000,
          now() - interval '3 hours');

  v := public.salud_del_vencimiento();
  PERFORM pg_temp.verificar('un hold vencido que nadie miró sale como atrasado',
    (v->>'atrasadas')::integer >= 1, v::text);

  -- Y al correr el mecanismo, deja de estar atrasado. Esto es lo que el job de
  -- pg_cron va a hacer cada 5 minutos en producción.
  PERFORM public.liberar_vencidas();

  v := public.salud_del_vencimiento();
  PERFORM pg_temp.verificar('y después de correr el vencimiento, ya no',
    (v->>'atrasadas')::integer = 0, v::text);

  -- Las noches quedaron libres: es para esto que todo lo anterior existe.
  PERFORM pg_temp.verificar('las noches del hold vencido quedaron libres',
    NOT EXISTS (
      SELECT 1 FROM public.noches_ocupadas(
        'aaaaaaaa-0000-0000-0000-000000000001', v_unidad)
       WHERE check_in = '2027-03-10'
    ));
END $$;

-- ============================================
-- 15. Cerrar y reabrir fechas
-- ============================================
-- `desbloquear()` existía desde la 009 y `bloquear()` no: el dueño podía
-- deshacer algo que no podía hacer. Lo que se comprueba acá es el par entero,
-- y sobre todo las dos cosas que lo hacen distinto de «escribir una fila»:
-- que no se pueda cerrar lo que ya está vendido, y que reabrir diga cuántas
-- reabrió en vez de contestar «listo».
DO $$
DECLARE
  v JSONB;
  v_complejo UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_unidad   UUID := 'bbbbbbbb-0000-0000-0000-000000000001';
  v_vecina   UUID := 'bbbbbbbb-0000-0000-0000-000000000009';
  v_bloqueo  UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  -- Cerrar unas noches libres.
  v := public.bloquear(v_complejo, v_unidad, '2027-06-10', '2027-06-14', 'La pintamos');
  PERFORM pg_temp.verificar('el dueño puede cerrar fechas libres',
    (v->>'ok')::boolean, v::text);
  v_bloqueo := (v->>'id')::uuid;

  -- Y esas noches quedan ocupadas de verdad, no sólo marcadas.
  PERFORM pg_temp.verificar('y esas noches quedan ocupadas',
    EXISTS (
      SELECT 1 FROM public.noches_ocupadas(v_complejo, v_unidad)
       WHERE check_in = '2027-06-10'
    ));

  -- Cerrar lo mismo otra vez tiene que chocar, no duplicar.
  v := public.bloquear(v_complejo, v_unidad, '2027-06-11', '2027-06-13', 'otra vez');
  PERFORM pg_temp.verificar('cerrar algo ya cerrado no crea un segundo bloqueo',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'ocupada', v::text);
  PERFORM pg_temp.verificar('y el mensaje dice que ya estaban cerradas',
    v->>'mensaje' LIKE '%cerradas%', v::text);

  -- Lo que importa: no se puede cerrar una noche VENDIDA.
  INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado,
                        origen, huesped_nombre, huesped_telefono, personas, importe)
  VALUES (v_complejo, v_unidad, '2027-07-01', '2027-07-05', 'CONFIRMED', 'web',
          'Huesped Vendido', '5491100002222', 2, 300000);

  v := public.bloquear(v_complejo, v_unidad, '2027-07-02', '2027-07-04', 'la quiero yo');
  PERFORM pg_temp.verificar('no se puede cerrar una noche ya vendida',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'ocupada', v::text);
  -- Y dice QUIÉN la tiene, que es lo que el dueño necesita para decidir.
  PERFORM pg_temp.verificar('y le dice al dueño quién la tiene',
    v->'choca_con'->>'huesped' = 'Huesped Vendido', v::text);
  PERFORM pg_temp.verificar('con el estado de esa reserva',
    v->'choca_con'->>'estado' = 'CONFIRMED', v::text);

  -- La unidad de otro complejo no se puede cerrar desde acá.
  v := public.bloquear(v_complejo, v_vecina, '2027-06-10', '2027-06-14', NULL);
  PERFORM pg_temp.verificar('no se puede cerrar una unidad de otro complejo',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'unidad_ajena', v::text);

  -- Fechas al revés.
  v := public.bloquear(v_complejo, v_unidad, '2027-06-20', '2027-06-20', NULL);
  PERFORM pg_temp.verificar('la salida tiene que ser posterior a la entrada',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'fechas_invalidas', v::text);

  -- La lista de lo cerrado.
  PERFORM pg_temp.verificar('el bloqueo aparece en la lista de fechas cerradas',
    EXISTS (SELECT 1 FROM public.bloqueos_del_complejo(v_complejo) WHERE id = v_bloqueo));
  PERFORM pg_temp.verificar('con su motivo y sus noches',
    EXISTS (
      SELECT 1 FROM public.bloqueos_del_complejo(v_complejo)
       WHERE id = v_bloqueo AND motivo = 'La pintamos' AND noches = 4
    ));
  -- Y la reserva vendida NO aparece ahí: son dos listas distintas.
  PERFORM pg_temp.verificar('y la reserva de un huésped no aparece entre los bloqueos',
    NOT EXISTS (
      SELECT 1 FROM public.bloqueos_del_complejo(v_complejo) WHERE check_in = '2027-07-01'
    ));

  -- Reabrir.
  v := public.reabrir(v_bloqueo);
  PERFORM pg_temp.verificar('reabrir una fecha cerrada funciona', (v->>'ok')::boolean, v::text);
  PERFORM pg_temp.verificar('y las noches quedan libres de verdad',
    NOT EXISTS (
      SELECT 1 FROM public.noches_ocupadas(v_complejo, v_unidad)
       WHERE check_in = '2027-06-10'
    ));
  PERFORM pg_temp.verificar('y sale de la lista de fechas cerradas',
    NOT EXISTS (SELECT 1 FROM public.bloqueos_del_complejo(v_complejo) WHERE id = v_bloqueo));

  -- Reabrir dos veces lo dice en vez de fingir.
  v := public.reabrir(v_bloqueo);
  PERFORM pg_temp.verificar('reabrir dos veces lo dice en vez de contestar «listo»',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'no_es_un_bloqueo', v::text);

  -- Y el botón de reabrir no puede tocar la reserva de un huésped.
  v := public.reabrir((SELECT id FROM reservas
                        WHERE unidad_id = v_unidad AND huesped_nombre = 'Huesped Vendido'));
  PERFORM pg_temp.verificar('reabrir no puede cancelar la reserva de un huésped',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'no_es_un_bloqueo', v::text);
  PERFORM pg_temp.verificar('y esa reserva sigue confirmada',
    (SELECT estado FROM reservas
      WHERE unidad_id = v_unidad AND huesped_nombre = 'Huesped Vendido') = 'CONFIRMED');

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- Y el vecino no puede cerrar ni reabrir nada ajeno.
DO $$
DECLARE
  v_ok BOOLEAN := false;
  v_bloqueo UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  v_bloqueo := (public.bloquear('aaaaaaaa-0000-0000-0000-000000000001',
                                'bbbbbbbb-0000-0000-0000-000000000002',
                                '2027-08-01', '2027-08-05', 'mía')->>'id')::uuid;

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  BEGIN
    PERFORM public.bloquear('aaaaaaaa-0000-0000-0000-000000000001',
                            'bbbbbbbb-0000-0000-0000-000000000002',
                            '2027-09-01', '2027-09-05', 'colado');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('el vecino no puede cerrar fechas de otro complejo', v_ok);

  v_ok := false;
  BEGIN
    PERFORM public.reabrir(v_bloqueo);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni reabrir las de otro', v_ok);

  PERFORM set_config('request.jwt.claim.sub', '', true);

  PERFORM pg_temp.verificar('y el bloqueo ajeno sigue en pie',
    (SELECT estado FROM reservas WHERE id = v_bloqueo) = 'BLOCKED');
END $$;


-- ============================================
-- 16. Precios desde el panel
-- ============================================
-- Un complejo propio, con las fechas calculadas desde `current_date`.
--
-- Los demás bloques usan fechas fijas de 2026/2027, y eso tiene fecha de
-- vencimiento: el día que pase el 31/3/2027, la ventana de reservas del
-- complejo de prueba va a estar vencida y las aserciones sobre precios futuros
-- van a fallar sin que nadie haya roto nada. Acá no, porque lo que se prueba
-- —la ventana, los agujeros, lo que vence— depende justamente de hoy.
INSERT INTO complejos (id, slug, nombre, reservas_habilitadas)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', 'posada-de-precios', 'Posada de Precios', true);

INSERT INTO complejo_miembros (complejo_id, user_id)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111');

INSERT INTO unidades (id, complejo_id, codigo, nombre, capacidad_maxima, orden) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'P1', 'Pieza Uno', 2, 1),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', 'P2', 'Pieza Dos', 4, 2);

DO $$
DECLARE
  v          JSONB;
  v_id       UUID;
  v_ok       BOOLEAN;
  -- El mismo "hoy" que usa la función: el día en la zona del complejo, no
  -- `current_date`, que es el del servidor. Entre las 21 de Argentina y la
  -- medianoche UTC son días distintos, y la prueba fallaría tres horas por día.
  v_hoy      DATE;
  v_complejo UUID := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_p1       UUID := 'cccccccc-0000-0000-0000-000000000001';
  v_p2       UUID := 'cccccccc-0000-0000-0000-000000000002';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  v_hoy := (now() AT TIME ZONE
            (SELECT zona_horaria FROM complejos WHERE id = v_complejo))::date;

  -- ----------------------------------------------------------------
  -- Sin configuración de calendario no se vende nada, y lo dice
  -- ----------------------------------------------------------------
  v := public.salud_de_los_precios(v_complejo);
  PERFORM pg_temp.verificar('sin config de calendario, la salud de precios lo dice',
    (v->>'sin_config')::boolean = true AND (v->>'esta_bien')::boolean = false, v::text);

  INSERT INTO config_calendario (complejo_id, primera_fecha, ultima_fecha, minimo_noches)
  VALUES (v_complejo, NULL, v_hoy + 180, 1);

  -- ----------------------------------------------------------------
  -- Toda la ventana sin precio: 181 noches que nadie puede reservar
  -- ----------------------------------------------------------------
  v := public.salud_de_los_precios(v_complejo);
  PERFORM pg_temp.verificar('la ventana entera sin períodos cuenta todas las noches',
    (v->>'noches_sin_periodo')::int = 181, v::text);
  PERFORM pg_temp.verificar('y dice desde qué noche empieza el agujero',
    (v->>'primera_noche_sin_periodo')::date = v_hoy, v::text);
  PERFORM pg_temp.verificar('y por lo tanto no está bien',
    (v->>'esta_bien')::boolean = false);

  -- ----------------------------------------------------------------
  -- Cargar un período
  -- ----------------------------------------------------------------
  v := public.guardar_periodo(v_complejo, v_hoy, v_hoy + 180,
         jsonb_build_object(v_p1::text, '50000', v_p2::text, '80000'), 'toda la ventana');
  PERFORM pg_temp.verificar('el dueño puede cargar un período con sus precios',
    (v->>'ok')::boolean = true AND (v->>'era_alta')::boolean = true
    AND (v->>'unidades_con_precio')::int = 2, v::text);
  v_id := (v->>'id')::uuid;

  PERFORM pg_temp.verificar('y ahora la ventana no tiene agujeros',
    (public.salud_de_los_precios(v_complejo)->>'esta_bien')::boolean = true,
    public.salud_de_los_precios(v_complejo)::text);

  -- Y la consecuencia de verdad: la página puede cotizar.
  v := public.cotizar_estadia(v_p1, v_hoy + 10, v_hoy + 13);
  PERFORM pg_temp.verificar('y la página puede cotizar con ese precio',
    (v->>'ok')::boolean = true AND (v->>'total')::numeric = 150000, v::text);

  -- ----------------------------------------------------------------
  -- Leer lo cargado
  -- ----------------------------------------------------------------
  PERFORM pg_temp.verificar('el período aparece en la lista del panel',
    (SELECT count(*) FROM public.periodos_del_complejo(v_complejo)) = 1);
  PERFORM pg_temp.verificar('con sus noches y su etiqueta',
    (SELECT noches = 181 AND etiqueta = 'toda la ventana'
       FROM public.periodos_del_complejo(v_complejo)));
  PERFORM pg_temp.verificar('y con una entrada por unidad, con nombre y precio',
    (SELECT jsonb_array_length(precios) = 2
            AND precios->0->>'codigo' = 'P1'
            AND (precios->0->>'precio')::numeric = 50000
       FROM public.periodos_del_complejo(v_complejo)));

  -- ----------------------------------------------------------------
  -- Dos períodos que se pisan
  -- ----------------------------------------------------------------
  -- Lo impide la restricción, no una lectura previa. Y el mensaje dice con qué
  -- se pisa, que es lo que el dueño necesita para moverlo.
  v := public.guardar_periodo(v_complejo, v_hoy + 100, v_hoy + 200,
         jsonb_build_object(v_p1::text, '90000'), 'alta');
  PERFORM pg_temp.verificar('un período que se pisa con otro no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'se_pisa', v::text);
  PERFORM pg_temp.verificar('y el mensaje dice con qué período se pisa',
    (v->'choca_con'->>'etiqueta') = 'toda la ventana'
    AND (v->'choca_con'->>'desde')::date = v_hoy, v::text);

  -- ----------------------------------------------------------------
  -- Editar
  -- ----------------------------------------------------------------
  v := public.guardar_periodo(v_complejo, v_hoy, v_hoy + 99,
         jsonb_build_object(v_p1::text, '55000', v_p2::text, '85000'),
         'media', v_id);
  PERFORM pg_temp.verificar('editar un período corrige sus fechas y sus precios',
    (v->>'ok')::boolean = true AND (v->>'era_alta')::boolean = false
    AND (v->>'noches')::int = 100, v::text);
  PERFORM pg_temp.verificar('y el precio nuevo es el que cotiza',
    (public.cotizar_estadia(v_p1, v_hoy + 10, v_hoy + 11)->>'total')::numeric = 55000);

  -- Al acortarlo quedaron 81 noches sin período, y la salud lo dice.
  v := public.salud_de_los_precios(v_complejo);
  PERFORM pg_temp.verificar('acortar un período deja el resto de la ventana sin precio',
    (v->>'noches_sin_periodo')::int = 81
    AND (v->>'primera_noche_sin_periodo')::date = v_hoy + 100, v::text);

  -- Ahora el segundo tramo entra, porque ya no se pisa.
  v := public.guardar_periodo(v_complejo, v_hoy + 100, v_hoy + 180,
         jsonb_build_object(v_p1::text, '90000', v_p2::text, '140000'), 'alta');
  PERFORM pg_temp.verificar('y el tramo que antes se pisaba ahora entra',
    (v->>'ok')::boolean = true, v::text);
  PERFORM pg_temp.verificar('con la ventana otra vez entera',
    (public.salud_de_los_precios(v_complejo)->>'esta_bien')::boolean = true);

  -- Una estadía que cruza el corte paga cada noche a su precio.
  v := public.cotizar_estadia(v_p1, v_hoy + 99, v_hoy + 101);
  PERFORM pg_temp.verificar('una estadía que cruza el corte paga cada noche a su precio',
    (v->>'total')::numeric = 55000 + 90000, v::text);

  -- ----------------------------------------------------------------
  -- Una unidad sin precio queda invendible, y eso se ve
  -- ----------------------------------------------------------------
  -- Esta es la falla silenciosa que motiva `salud_de_los_precios()`: el
  -- período existe, el calendario muestra la unidad libre, y recién al pedir el
  -- precio aparece que no hay.
  v := public.guardar_periodo(v_complejo, v_hoy + 100, v_hoy + 180,
         jsonb_build_object(v_p1::text, '90000', v_p2::text, ''),
         'alta', (SELECT id FROM public.periodos_del_complejo(v_complejo)
                   WHERE etiqueta = 'alta'));
  PERFORM pg_temp.verificar('dejar una unidad sin precio está permitido',
    (v->>'ok')::boolean = true AND (v->>'unidades_con_precio')::int = 1, v::text);

  v := public.salud_de_los_precios(v_complejo);
  PERFORM pg_temp.verificar('pero la salud de precios dice qué unidad quedó invendible',
    jsonb_array_length(v->'unidades_sin_precio') = 1
    AND v->'unidades_sin_precio'->0->>'codigo' = 'P2', v::text);
  PERFORM pg_temp.verificar('con cuántas noches y desde cuándo',
    (v->'unidades_sin_precio'->0->>'noches')::int = 81
    AND (v->'unidades_sin_precio'->0->>'desde')::date = v_hoy + 100, v::text);
  PERFORM pg_temp.verificar('y por lo tanto no está bien',
    (v->>'esta_bien')::boolean = false);

  -- La consecuencia de verdad, para que no sea una aserción sobre un informe.
  v := public.cotizar_estadia(v_p2, v_hoy + 101, v_hoy + 103);
  PERFORM pg_temp.verificar('y esa unidad no se puede cotizar en ese tramo',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'noche_sin_precio', v::text);
  PERFORM pg_temp.verificar('mientras la otra sí',
    (public.cotizar_estadia(v_p1, v_hoy + 101, v_hoy + 103)->>'ok')::boolean = true);

  -- Volver a ponerle precio lo arregla.
  v := public.guardar_periodo(v_complejo, v_hoy + 100, v_hoy + 180,
         jsonb_build_object(v_p1::text, '90000', v_p2::text, '140000'),
         'alta', (SELECT id FROM public.periodos_del_complejo(v_complejo)
                   WHERE etiqueta = 'alta'));
  PERFORM pg_temp.verificar('ponerle el precio de nuevo cierra el agujero',
    (public.salud_de_los_precios(v_complejo)->>'esta_bien')::boolean = true);

  -- ----------------------------------------------------------------
  -- La unidad fuera de circulación no es un agujero
  -- ----------------------------------------------------------------
  -- `unidades.activa` existe desde la 001 y lo respetan `complejo_publico()` y
  -- `crear_reserva()`. Así que una unidad inactiva sin precio NO es un
  -- problema: no se puede reservar por otro motivo.
  --
  -- La primera versión de `salud_de_los_precios()` contaba todas las unidades,
  -- y le habría puesto un rojo permanente al dueño que saca la cabaña chica en
  -- invierno —que es el caso normal, no el raro—.
  UPDATE unidades SET activa = false WHERE id = v_p2;
  v := public.guardar_periodo(v_complejo, v_hoy + 100, v_hoy + 180,
         jsonb_build_object(v_p1::text, '90000', v_p2::text, ''),
         'alta', (SELECT id FROM public.periodos_del_complejo(v_complejo)
                   WHERE etiqueta = 'alta'));
  PERFORM pg_temp.verificar('sacar una unidad de circulación y dejarla sin precio está bien',
    (v->>'ok')::boolean = true, v::text);

  v := public.salud_de_los_precios(v_complejo);
  PERFORM pg_temp.verificar('y la salud de precios no la cuenta como agujero',
    jsonb_array_length(v->'unidades_sin_precio') = 0
    AND (v->>'esta_bien')::boolean = true, v::text);
  PERFORM pg_temp.verificar('y cuenta una sola unidad vendible, no dos',
    (v->>'unidades')::int = 1, v::text);

  -- Pero el formulario tiene que seguir viéndola, porque los precios se
  -- reemplazan enteros: si no apareciera, guardar le borraría el precio y el
  -- día que el dueño la reactive quedaría invendible en silencio.
  PERFORM pg_temp.verificar('pero la lista del panel la sigue mostrando, marcada',
    (SELECT jsonb_array_length(precios) = 2
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(precios) AS e
                         WHERE e->>'codigo' = 'P2' AND (e->>'activa')::boolean = false)
       FROM public.periodos_del_complejo(v_complejo)
      WHERE etiqueta = 'alta'));

  -- Y al reactivarla, el agujero reaparece: es el mismo agujero de antes.
  UPDATE unidades SET activa = true WHERE id = v_p2;
  PERFORM pg_temp.verificar('y al volver a activarla el agujero reaparece',
    (public.salud_de_los_precios(v_complejo)->>'esta_bien')::boolean = false);

  -- Se le pone el precio y queda bien.
  PERFORM public.guardar_periodo(v_complejo, v_hoy + 100, v_hoy + 180,
            jsonb_build_object(v_p1::text, '90000', v_p2::text, '140000'),
            'alta', (SELECT id FROM public.periodos_del_complejo(v_complejo)
                      WHERE etiqueta = 'alta'));
  PERFORM pg_temp.verificar('y con el precio puesto vuelve a estar todo cotizable',
    (public.salud_de_los_precios(v_complejo)->>'esta_bien')::boolean = true);

  -- ----------------------------------------------------------------
  -- Lo que no es un precio
  -- ----------------------------------------------------------------
  v := public.guardar_periodo(v_complejo, v_hoy + 300, v_hoy + 310,
         jsonb_build_object(v_p1::text, '0'));
  PERFORM pg_temp.verificar('un precio en cero no entra, y el mensaje nombra la unidad',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'precio_no_positivo'
    AND v->>'mensaje' LIKE '%Pieza Uno%', v::text);

  v := public.guardar_periodo(v_complejo, v_hoy + 300, v_hoy + 310,
         jsonb_build_object(v_p1::text, 'gratis'));
  PERFORM pg_temp.verificar('un precio que no es un número tampoco, y no revienta',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'precio_invalido'
    AND v->>'mensaje' LIKE '%Pieza Uno%', v::text);

  v := public.guardar_periodo(v_complejo, v_hoy + 300, v_hoy + 310,
         jsonb_build_object('no-soy-un-uuid', '50000'));
  PERFORM pg_temp.verificar('una clave que no es un id tampoco, y no revienta',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'precios_invalidos', v::text);

  -- La coma decimal, que es como se escribe un precio acá.
  v := public.guardar_periodo(v_complejo, v_hoy + 300, v_hoy + 310,
         jsonb_build_object(v_p1::text, '1234,50'), 'con coma');
  PERFORM pg_temp.verificar('un precio con coma decimal se guarda bien',
    (v->>'ok')::boolean = true, v::text);
  PERFORM pg_temp.verificar('y vale lo que dice',
    (SELECT precio FROM precios_unidad
      WHERE periodo_id = (v->>'id')::uuid AND unidad_id = v_p1) = 1234.50);

  v := public.guardar_periodo(v_complejo, v_hoy + 20, v_hoy + 10,
         jsonb_build_object(v_p1::text, '50000'));
  PERFORM pg_temp.verificar('un tramo al revés no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'fechas_invalidas', v::text);

  -- ----------------------------------------------------------------
  -- Borrar
  -- ----------------------------------------------------------------
  -- El período «con coma» está en hoy+300, más allá de `ultima_fecha`. Borrarlo
  -- no deja ninguna noche RESERVABLE sin precio, y el aviso no tiene que
  -- contarlas: un aviso sobre algo que no es un problema es el que enseña a
  -- ignorar los avisos. (La primera versión de `borrar_periodo()` decía 11.)
  v := public.borrar_periodo((SELECT id FROM public.periodos_del_complejo(v_complejo)
                               WHERE etiqueta = 'con coma'));
  PERFORM pg_temp.verificar('borrar un período fuera de la ventana no avisa de nada',
    (v->>'ok')::boolean = true
    AND (v->>'noches_que_quedaron_sin_precio')::int = 0, v::text);

  v := public.borrar_periodo((SELECT id FROM public.periodos_del_complejo(v_complejo)
                               WHERE etiqueta = 'alta'));
  PERFORM pg_temp.verificar('borrar uno de la ventana avisa cuántas noches quedaron sin precio',
    (v->>'ok')::boolean = true
    AND (v->>'noches_que_quedaron_sin_precio')::int = 81, v::text);

  PERFORM pg_temp.verificar('y sus precios se fueron con él',
    (SELECT count(*) FROM precios_unidad pu
      JOIN periodos_precio p ON p.id = pu.periodo_id
     WHERE p.complejo_id = v_complejo) = 2);

  v := public.borrar_periodo(gen_random_uuid());
  PERFORM pg_temp.verificar('borrar algo que no está lo dice en vez de contestar «listo»',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'no_existe', v::text);

  -- ----------------------------------------------------------------
  -- La ventana que vence sola
  -- ----------------------------------------------------------------
  -- `ultima_fecha` es una fecha que se pasa sin que nadie la toque. El día que
  -- pasa, el calendario deja de ofrecer todo y nada avisa. De las tres fallas
  -- que esta función busca, es la que le va a pasar a todos los clientes.
  UPDATE config_calendario SET ultima_fecha = v_hoy - 1 WHERE complejo_id = v_complejo;
  v := public.salud_de_los_precios(v_complejo);
  PERFORM pg_temp.verificar('una ventana de reservas vencida se detecta',
    (v->>'ventana_vencida')::boolean = true AND (v->>'esta_bien')::boolean = false, v::text);
  PERFORM pg_temp.verificar('y dice hace cuántos días venció',
    (v->>'dias_hasta_el_cierre')::int = -1, v::text);

  UPDATE config_calendario SET ultima_fecha = v_hoy + 30 WHERE complejo_id = v_complejo;
  PERFORM pg_temp.verificar('y cuántos faltan cuando no venció',
    (public.salud_de_los_precios(v_complejo)->>'dias_hasta_el_cierre')::int = 30);

  -- Y si la temporada todavía no abrió, la ventana arranca en `primera_fecha` y
  -- no hoy: las noches de antes no son un agujero, no se venden nunca.
  UPDATE config_calendario
     SET primera_fecha = v_hoy + 10, ultima_fecha = v_hoy + 30
   WHERE complejo_id = v_complejo;
  v := public.salud_de_los_precios(v_complejo);
  PERFORM pg_temp.verificar('una temporada que todavía no abrió arranca en su primera fecha',
    (v->>'ventana_desde')::date = v_hoy + 10, v::text);

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- Y nada de esto lo puede tocar el vecino.
DO $$
DECLARE
  v_ok    BOOLEAN;
  v_ajeno UUID;
BEGIN
  v_ajeno := (SELECT id FROM periodos_precio
               WHERE complejo_id = 'aaaaaaaa-0000-0000-0000-000000000003' LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  v_ok := false;
  BEGIN
    PERFORM public.periodos_del_complejo('aaaaaaaa-0000-0000-0000-000000000003');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('el vecino no puede leer los períodos de otro complejo', v_ok);

  v_ok := false;
  BEGIN
    PERFORM public.salud_de_los_precios('aaaaaaaa-0000-0000-0000-000000000003');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni su salud de precios', v_ok);

  v_ok := false;
  BEGIN
    PERFORM public.guardar_periodo('aaaaaaaa-0000-0000-0000-000000000003',
      current_date, current_date + 5,
      jsonb_build_object('cccccccc-0000-0000-0000-000000000001', '1'));
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni cargarle precios', v_ok);

  v_ok := false;
  BEGIN
    PERFORM public.borrar_periodo(v_ajeno);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni borrarle un período', v_ok);

  -- Y el agujero que esto tapa: la unidad ajena mandada en el payload de un
  -- complejo propio. `guardar_periodo()` es SECURITY DEFINER, así que la policy
  -- de `precios_unidad` no corre: sin la validación explícita, esto pasaría.
  v_ok := false;
  BEGIN
    PERFORM public.guardar_periodo('aaaaaaaa-0000-0000-0000-000000000002',
      current_date, current_date + 5,
      jsonb_build_object('cccccccc-0000-0000-0000-000000000001', '99999'));
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni ponerle precio a una unidad ajena desde su propio complejo', v_ok);

  PERFORM set_config('request.jwt.claim.sub', '', true);

  PERFORM pg_temp.verificar('y el período ajeno sigue en pie',
    (SELECT count(*) FROM periodos_precio WHERE id = v_ajeno) = 1);
END $$;


-- ============================================
-- 17. Las reglas del calendario desde el panel
-- ============================================
-- Sigue sobre el complejo de la 16 ('posada-de-precios'), que al final del
-- bloque anterior quedó con `primera_fecha = hoy+10`, `ultima_fecha = hoy+30`
-- y un solo período de precios de hoy a hoy+99.
--
-- Lo que importa de este bloque: cada regla que se guarda se comprueba contra
-- `crear_reserva()`, no contra el informe. Que la función devuelva `ok: true`
-- sólo dice que escribió una fila; lo que hay que saber es si la página deja o
-- no deja reservar.
DO $$
DECLARE
  v          JSONB;
  v_id       UUID;
  v_hoy      DATE;
  v_complejo UUID := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_p1       UUID := 'cccccccc-0000-0000-0000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  v_hoy := (now() AT TIME ZONE
            (SELECT zona_horaria FROM complejos WHERE id = v_complejo))::date;

  -- Esta posada necesita slug para que `crear_reserva()` la encuentre, y un
  -- precio en toda la ventana para que pueda cotizar.
  PERFORM public.guardar_periodo(v_complejo, v_hoy, v_hoy + 400,
            jsonb_build_object(v_p1::text, '50000'), 'todo',
            (SELECT id FROM public.periodos_del_complejo(v_complejo) LIMIT 1));

  -- ----------------------------------------------------------------
  -- La ventana de reservas
  -- ----------------------------------------------------------------
  v := public.guardar_config_calendario(v_complejo, v_hoy + 120, 2::smallint, NULL);
  PERFORM pg_temp.verificar('el dueño puede mover hasta cuándo se vende',
    (v->>'ok')::boolean = true AND (v->>'dias_hasta_el_cierre')::int = 120, v::text);
  PERFORM pg_temp.verificar('y la ventana nueva no tiene noches sin precio',
    (v->>'noches_sin_precio')::int = 0, v::text);

  -- Y la consecuencia: antes de mover la ventana, hoy+100 no se podía pedir.
  v := public.crear_reserva('posada-de-precios', v_p1, v_hoy + 100, v_hoy + 104,
         2::smallint, 'Prueba Ventana', '30111222', 'v@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('y ahora se puede reservar dentro de la ventana nueva',
    (v->>'ok')::boolean = true, v::text);

  -- Más allá sigue sin poderse, que es el punto de que la ventana exista.
  v := public.crear_reserva('posada-de-precios', v_p1, v_hoy + 130, v_hoy + 134,
         2::smallint, 'Prueba Afuera', '30111223', 'a@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('pero no más allá del día que puso el dueño',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'despues_de_la_ventana', v::text);

  -- Estirar la ventana a un tramo sin precio lo dice en el acto. Es el error
  -- que se comete de verdad: estirar hasta marzo y olvidarse de los precios de
  -- marzo. Ahí el huésped elige fechas y recién después no hay precio.
  v := public.guardar_config_calendario(v_complejo, v_hoy + 500, 2::smallint, NULL);
  PERFORM pg_temp.verificar('estirar la ventana más allá de los precios lo avisa al guardar',
    (v->>'ok')::boolean = true AND (v->>'noches_sin_precio')::int = 100, v::text);

  -- ----------------------------------------------------------------
  -- Lo que no es una ventana
  -- ----------------------------------------------------------------
  v := public.guardar_config_calendario(v_complejo, NULL, 2::smallint, NULL);
  PERFORM pg_temp.verificar('sin hasta cuándo no se guarda nada',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'falta_ultima_fecha', v::text);

  v := public.guardar_config_calendario(v_complejo, v_hoy + 10, 2::smallint, v_hoy + 20);
  PERFORM pg_temp.verificar('una ventana al revés no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'fechas_invalidas', v::text);

  v := public.guardar_config_calendario(v_complejo, v_hoy + 100, 99::smallint, NULL);
  PERFORM pg_temp.verificar('un mínimo de 99 noches no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'minimo_invalido', v::text);

  -- Una ventana ya vencida SÍ se guarda, y lo dice. Negárselo lo dejaría sin
  -- poder escribir nada mientras corrige.
  v := public.guardar_config_calendario(v_complejo, v_hoy - 5, 2::smallint, NULL);
  PERFORM pg_temp.verificar('una ventana ya vencida se guarda pero lo dice',
    (v->>'ok')::boolean = true AND (v->>'ventana_vencida')::boolean = true, v::text);
  PERFORM pg_temp.verificar('y la salud de precios la pone en rojo',
    (public.salud_de_los_precios(v_complejo)->>'ventana_vencida')::boolean = true);

  -- Y con la ventana vencida no se puede reservar NADA, que es la falla
  -- silenciosa que todo esto existe para que el dueño pueda arreglar solo.
  v := public.crear_reserva('posada-de-precios', v_p1, v_hoy + 5, v_hoy + 9,
         2::smallint, 'Prueba Vencida', '30111224', 'x@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('con la ventana vencida no se puede reservar nada',
    (v->>'ok')::boolean = false, v::text);

  -- Y el dueño lo arregla solo, que es el punto del bloque.
  v := public.guardar_config_calendario(v_complejo, v_hoy + 400, 2::smallint, NULL);
  PERFORM pg_temp.verificar('y el dueño lo arregla solo moviendo la fecha',
    (v->>'ok')::boolean = true AND (v->>'ventana_vencida')::boolean = false, v::text);
  v := public.crear_reserva('posada-de-precios', v_p1, v_hoy + 5, v_hoy + 9,
         2::smallint, 'Prueba Arreglada', '30111225', 'y@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('y se vuelve a poder reservar',
    (v->>'ok')::boolean = true, v::text);

  -- ----------------------------------------------------------------
  -- Los mínimos por tramo: la ex-constante del código
  -- ----------------------------------------------------------------
  -- En la página vieja la temporada alta era una constante: 20/12 al 1/3, siete
  -- noches, entrada sábado o domingo. Esto es cargarla sin tocar un archivo.
  v := public.guardar_minimo(v_complejo, v_hoy + 200, v_hoy + 260, 7::smallint,
         ARRAY[6, 0]::smallint[], 'temporada alta');
  PERFORM pg_temp.verificar('el dueño puede cargar un mínimo por tramo',
    (v->>'ok')::boolean = true AND (v->>'cualquier_dia')::boolean = false, v::text);
  v_id := (v->>'id')::uuid;

  -- Cuatro noches en un tramo de siete: no entra.
  v := public.crear_reserva('posada-de-precios', v_p1, v_hoy + 205, v_hoy + 209,
         2::smallint, 'Prueba Minimo', '30111226', 'm@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('y cuatro noches no entran en un tramo de siete',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'pocas_noches'
    AND (v->>'minimo')::int = 7, v::text);

  -- Siete noches pero entrando un día que no es sábado ni domingo: tampoco.
  v := public.crear_reserva('posada-de-precios', v_p1,
         v_hoy + 200 + ((9 - extract(dow FROM v_hoy + 200)::int) % 7), -- cae en martes
         v_hoy + 207 + ((9 - extract(dow FROM v_hoy + 200)::int) % 7),
         2::smallint, 'Prueba Dia', '30111227', 'd@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('ni siete noches entrando un martes',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'dia_de_entrada', v::text);

  -- Siete noches entrando sábado: sí.
  v := public.crear_reserva('posada-de-precios', v_p1,
         v_hoy + 200 + ((13 - extract(dow FROM v_hoy + 200)::int) % 7), -- cae en sábado
         v_hoy + 207 + ((13 - extract(dow FROM v_hoy + 200)::int) % 7),
         2::smallint, 'Prueba Sabado', '30111228', 's@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('pero sí siete noches entrando sábado',
    (v->>'ok')::boolean = true, v::text);

  -- ----------------------------------------------------------------
  -- Los días de entrada, normalizados
  -- ----------------------------------------------------------------
  -- Siete días elegidos es «cualquier día», y se guarda como NULL. Si se
  -- guardara como arreglo, la página le diría al huésped «se puede entrar
  -- domingo, lunes, martes…» en vez de no decir nada.
  v := public.guardar_minimo(v_complejo, v_hoy + 200, v_hoy + 260, 7::smallint,
         ARRAY[0,1,2,3,4,5,6]::smallint[], 'temporada alta', v_id);
  PERFORM pg_temp.verificar('elegir los siete días es no restringir ninguno',
    (v->>'ok')::boolean = true AND (v->>'cualquier_dia')::boolean = true, v::text);
  PERFORM pg_temp.verificar('y se guarda como nulo, no como los siete',
    (SELECT dias_checkin IS NULL FROM minimos_noches WHERE id = v_id));

  v := public.guardar_minimo(v_complejo, v_hoy + 200, v_hoy + 260, 7::smallint,
         ARRAY[]::smallint[], 'temporada alta', v_id);
  PERFORM pg_temp.verificar('un arreglo vacío tampoco deja el tramo invendible',
    (v->>'cualquier_dia')::boolean = true, v::text);

  v := public.guardar_minimo(v_complejo, v_hoy + 200, v_hoy + 260, 7::smallint,
         ARRAY[6,0,6,9,-1]::smallint[], 'temporada alta', v_id);
  PERFORM pg_temp.verificar('los días repetidos y los que no existen se limpian',
    (v->'dias_checkin')::text = '[0, 6]', v::text);

  -- ----------------------------------------------------------------
  -- Dos tramos que se pisan
  -- ----------------------------------------------------------------
  v := public.guardar_minimo(v_complejo, v_hoy + 250, v_hoy + 300, 3::smallint,
         NULL, 'media');
  PERFORM pg_temp.verificar('un tramo de mínimos que se pisa con otro no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'se_pisa', v::text);
  PERFORM pg_temp.verificar('y dice con cuál y de cuántas noches',
    v->'choca_con'->>'etiqueta' = 'temporada alta'
    AND (v->'choca_con'->>'noches')::int = 7, v::text);

  -- Pegado pero sin pisarse, sí.
  v := public.guardar_minimo(v_complejo, v_hoy + 261, v_hoy + 300, 3::smallint,
         NULL, 'media');
  PERFORM pg_temp.verificar('pegado al anterior sin pisarse, entra',
    (v->>'ok')::boolean = true, v::text);

  v := public.guardar_minimo(v_complejo, v_hoy + 200, v_hoy + 260, 99::smallint,
         NULL, 'imposible');
  PERFORM pg_temp.verificar('un mínimo de 99 noches por tramo tampoco entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'noches_invalidas', v::text);

  -- ----------------------------------------------------------------
  -- Borrar un tramo dice a qué mínimo vuelven esas noches
  -- ----------------------------------------------------------------
  -- Sin eso, el dueño borra el tramo de enero creyendo que queda sin mínimo y
  -- se encuentra con que ahora se puede reservar una sola noche en temporada.
  v := public.borrar_minimo(v_id);
  PERFORM pg_temp.verificar('borrar un tramo dice a qué mínimo general vuelven',
    (v->>'ok')::boolean = true AND (v->>'vuelven_al_minimo_general')::int = 2, v::text);

  v := public.borrar_minimo(v_id);
  PERFORM pg_temp.verificar('borrarlo dos veces lo dice en vez de contestar «listo»',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'no_existe', v::text);

  -- ----------------------------------------------------------------
  -- Los bloques que van enteros
  -- ----------------------------------------------------------------
  v := public.guardar_bloque_fijo(v_complejo, v_hoy + 310, v_hoy + 313, 'finde largo');
  PERFORM pg_temp.verificar('el dueño puede cargar un bloque que va entero',
    (v->>'ok')::boolean = true AND (v->>'noches')::int = 3, v::text);
  v_id := (v->>'id')::uuid;

  -- Y lo que el bloque existe para evitar: que se lo partan.
  v := public.crear_reserva('posada-de-precios', v_p1, v_hoy + 310, v_hoy + 312,
         2::smallint, 'Prueba Partido', '30111229', 'p@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('y nadie puede tomar dos de sus tres noches',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'bloque_fijo', v::text);

  v := public.crear_reserva('posada-de-precios', v_p1, v_hoy + 310, v_hoy + 313,
         2::smallint, 'Prueba Entero', '30111230', 'e@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('pero sí las tres juntas',
    (v->>'ok')::boolean = true, v::text);

  v := public.guardar_bloque_fijo(v_complejo, v_hoy + 312, v_hoy + 315, 'otro');
  PERFORM pg_temp.verificar('dos bloques que se pisan no pueden coexistir',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'se_pisa', v::text);
  PERFORM pg_temp.verificar('y dice con cuál',
    v->'choca_con'->>'etiqueta' = 'finde largo', v::text);

  v := public.guardar_bloque_fijo(v_complejo, v_hoy + 320, v_hoy + 320, 'de cero noches');
  PERFORM pg_temp.verificar('un bloque de cero noches no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'fechas_invalidas', v::text);

  v := public.borrar_bloque_fijo(v_id);
  PERFORM pg_temp.verificar('borrar el bloque devuelve esas noches de a una',
    (v->>'ok')::boolean = true, v::text);

  -- ----------------------------------------------------------------
  -- Leer las reglas
  -- ----------------------------------------------------------------
  PERFORM public.guardar_minimo(v_complejo, v_hoy - 100, v_hoy - 50, 5::smallint,
            NULL, 'temporada pasada');
  PERFORM public.guardar_minimo(v_complejo, v_hoy - 10, v_hoy + 10, 4::smallint,
            NULL, 'el de ahora');

  v := public.reglas_del_calendario(v_complejo);
  PERFORM pg_temp.verificar('las reglas vienen juntas, con la config adentro',
    (v->'config'->>'ultima_fecha')::date = v_hoy + 400
    AND (v->'config'->>'minimo_noches')::int = 2, v::text);
  PERFORM pg_temp.verificar('un tramo de la temporada pasada no aparece',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'minimos') AS e
                 WHERE e->>'etiqueta' = 'temporada pasada'), v::text);
  PERFORM pg_temp.verificar('pero el tramo en curso sí, aunque haya arrancado antes de hoy',
    EXISTS (SELECT 1 FROM jsonb_array_elements(v->'minimos') AS e
             WHERE e->>'etiqueta' = 'el de ahora'), v::text);
  PERFORM pg_temp.verificar('y los bloques vienen en la misma respuesta',
    jsonb_typeof(v->'bloques') = 'array', v::text);

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- Un complejo sin configuración todavía: es el estado de uno recién creado, y
-- la pantalla tiene que poder mostrarlo.
DO $$
DECLARE v JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  v := public.reglas_del_calendario('aaaaaaaa-0000-0000-0000-000000000002');
  PERFORM pg_temp.verificar('un complejo sin config devuelve config nula, no un error',
    v->'config' = 'null'::jsonb AND jsonb_array_length(v->'minimos') = 0, v::text);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- Y nada de esto lo puede tocar el vecino.
DO $$
DECLARE
  v_ok    BOOLEAN;
  v_ajeno UUID;
BEGIN
  v_ajeno := (SELECT id FROM minimos_noches
               WHERE complejo_id = 'aaaaaaaa-0000-0000-0000-000000000003' LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  v_ok := false;
  BEGIN
    PERFORM public.guardar_config_calendario('aaaaaaaa-0000-0000-0000-000000000003',
      current_date + 10, 1::smallint, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('el vecino no puede mover la ventana de otro complejo', v_ok);

  v_ok := false;
  BEGIN
    PERFORM public.reglas_del_calendario('aaaaaaaa-0000-0000-0000-000000000003');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni leer sus reglas', v_ok);

  v_ok := false;
  BEGIN
    PERFORM public.borrar_minimo(v_ajeno);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni borrarle un tramo de mínimos', v_ok);

  v_ok := false;
  BEGIN
    PERFORM public.guardar_minimo('aaaaaaaa-0000-0000-0000-000000000003',
      current_date, current_date + 5, 2::smallint, NULL, 'colado', v_ajeno);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni editárselo', v_ok);

  PERFORM set_config('request.jwt.claim.sub', '', true);

  PERFORM pg_temp.verificar('y el tramo ajeno sigue como estaba',
    (SELECT etiqueta FROM minimos_noches WHERE id = v_ajeno) <> 'colado');
END $$;


-- ============================================
-- 18. Los datos del complejo y sus unidades
-- ============================================
-- El bloque arregla una mentira que ya estaba viva: el panel decía «se carga en
-- los datos del complejo» y esa pantalla no existía.
DO $$
DECLARE
  v          JSONB;
  v_id       UUID;
  v_ok       BOOLEAN;
  v_hoy      DATE;
  v_complejo UUID := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_p1       UUID := 'cccccccc-0000-0000-0000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  v_hoy := (now() AT TIME ZONE
            (SELECT zona_horaria FROM complejos WHERE id = v_complejo))::date;

  -- ----------------------------------------------------------------
  -- El dato que cuesta plata
  -- ----------------------------------------------------------------
  -- Sin `datos_transferencia` el huésped reserva, ve cuánto tiene que señar y
  -- no sabe a dónde mandarlo. La respuesta lo dice para que el aviso del panel
  -- se apague en el acto cuando el dueño lo arregla.
  v := public.guardar_datos_del_complejo(v_complejo, 'Posada de Precios');
  PERFORM pg_temp.verificar('guardar los datos dice que falta dónde transferir',
    (v->>'ok')::boolean = true AND (v->>'falta_donde_transferir')::boolean = true, v::text);

  v := public.guardar_datos_del_complejo(v_complejo, 'Posada de Precios',
         NULL, 'Alias: posada.precios / CBU 0000003100000000000001');
  PERFORM pg_temp.verificar('y cuando se carga, deja de faltar',
    (v->>'falta_donde_transferir')::boolean = false, v::text);
  PERFORM pg_temp.verificar('y el huésped lo ve en los datos para transferir',
    (public.datos_para_transferir('posada-de-precios')->>'datos_transferencia')
      LIKE 'Alias: posada.precios%');

  -- ----------------------------------------------------------------
  -- El WhatsApp se limpia, no se rechaza
  -- ----------------------------------------------------------------
  -- El dueño lo copia del teléfono, donde viene con `+` y espacios, y la página
  -- arma un `wa.me/<numero>` que no acepta nada más que dígitos. Hacerle borrar
  -- los espacios a mano sería pedirle que haga el trabajo de un regexp.
  v := public.guardar_datos_del_complejo(v_complejo, 'Posada de Precios',
         '+54 9 223 555-0000');
  PERFORM pg_temp.verificar('un WhatsApp con + y espacios se guarda limpio',
    v->>'whatsapp' = '5492235550000', v::text);
  PERFORM pg_temp.verificar('y deja de faltar',
    (v->>'falta_whatsapp')::boolean = false, v::text);

  v := public.guardar_datos_del_complejo(v_complejo, 'Posada de Precios', '2235');
  PERFORM pg_temp.verificar('un número demasiado corto no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'whatsapp_corto', v::text);
  PERFORM pg_temp.verificar('y el mensaje muestra lo que el dueño escribió',
    v->>'mensaje' LIKE '%2235%', v::text);
  PERFORM pg_temp.verificar('y el que estaba guardado sigue ahí',
    (SELECT whatsapp FROM complejos WHERE id = v_complejo) = '5492235550000');

  -- ----------------------------------------------------------------
  -- No mandar un campo lo deja como estaba; mandarlo vacío lo borra
  -- ----------------------------------------------------------------
  v := public.guardar_datos_del_complejo(v_complejo, 'Posada de Precios');
  PERFORM pg_temp.verificar('no mandar el WhatsApp no lo borra',
    (SELECT whatsapp FROM complejos WHERE id = v_complejo) = '5492235550000', v::text);

  v := public.guardar_datos_del_complejo(v_complejo, 'Posada de Precios', '');
  PERFORM pg_temp.verificar('mandarlo vacío sí lo borra, que es lo que se pidió',
    (SELECT whatsapp IS NULL FROM complejos WHERE id = v_complejo), v::text);

  -- Y el nombre no puede quedar vacío: es lo que ve el huésped.
  v := public.guardar_datos_del_complejo(v_complejo, '   ');
  PERFORM pg_temp.verificar('el complejo no se puede quedar sin nombre',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'falta_nombre', v::text);

  -- ----------------------------------------------------------------
  -- La seña y su plazo
  -- ----------------------------------------------------------------
  v := public.guardar_datos_del_complejo(v_complejo, 'Posada de Precios',
         NULL, NULL, NULL, NULL, 30::numeric, 24::smallint);
  PERFORM pg_temp.verificar('el dueño puede cambiar la seña y el plazo',
    (v->>'ok')::boolean = true
    AND (SELECT porcentaje_sena = 30 AND horas_vencimiento_sena = 24
           FROM complejos WHERE id = v_complejo), v::text);

  -- Y la consecuencia: la cotización que ve el huésped usa el porcentaje nuevo.
  PERFORM pg_temp.verificar('y la seña que se le pide al huésped cambia con eso',
    (public.cotizar_estadia(v_p1, v_hoy + 50, v_hoy + 52)->>'sena')::numeric
      = round((public.cotizar_estadia(v_p1, v_hoy + 50, v_hoy + 52)->>'total')::numeric * 30 / 100));

  v := public.guardar_datos_del_complejo(v_complejo, 'Posada de Precios',
         NULL, NULL, NULL, NULL, 0::numeric);
  PERFORM pg_temp.verificar('una seña de 0% no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'porcentaje_invalido', v::text);

  v := public.guardar_datos_del_complejo(v_complejo, 'Posada de Precios',
         NULL, NULL, NULL, NULL, NULL, 500::smallint);
  PERFORM pg_temp.verificar('un plazo de 500 horas tampoco',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'horas_invalidas', v::text);

  -- ----------------------------------------------------------------
  -- El slug no se toca
  -- ----------------------------------------------------------------
  -- El dueño mandó el link de su página por WhatsApp a cada huésped. La función
  -- no ofrece el campo, y el trigger de la 007 lo prohíbe de todos modos.
  PERFORM pg_temp.verificar('guardar los datos no le cambia la dirección a la página',
    (SELECT slug FROM complejos WHERE id = v_complejo) = 'posada-de-precios');

  v_ok := false;
  BEGIN
    UPDATE complejos SET slug = 'otra-cosa' WHERE id = v_complejo;
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('y cambiarlo a mano sigue prohibido', v_ok);

  -- ----------------------------------------------------------------
  -- Prender y apagar el alta pública
  -- ----------------------------------------------------------------
  -- Prender con la casa a medio cargar es peor que no prender: la página queda
  -- abierta, no deja reservar nada igual, y el dueño cree que está vendiendo.
  UPDATE config_calendario SET ultima_fecha = v_hoy + 900 WHERE complejo_id = v_complejo;
  v := public.habilitar_reservas(v_complejo, true);
  PERFORM pg_temp.verificar('prender con noches sin precio avisa que no se puede reservar',
    (v->>'ok')::boolean = true
    AND (v->>'pero_no_se_puede_reservar')::boolean = true, v::text);

  -- Y con TODO cargado no avisa nada. El bloque 17 dejó el único período con
  -- precio sólo para P1, así que primero hay que ponerle precio a P2: si no, el
  -- aviso sigue siendo correcto y lo que estaría mal es la aserción.
  UPDATE config_calendario SET ultima_fecha = v_hoy + 400 WHERE complejo_id = v_complejo;
  PERFORM public.guardar_periodo(v_complejo, v_hoy, v_hoy + 400,
            jsonb_build_object(v_p1::text, '50000',
                               'cccccccc-0000-0000-0000-000000000002', '80000'),
            'todo', (SELECT id FROM public.periodos_del_complejo(v_complejo) LIMIT 1));
  v := public.habilitar_reservas(v_complejo, true);
  PERFORM pg_temp.verificar('y con todo cargado no avisa nada',
    (v->>'pero_no_se_puede_reservar')::boolean = false, v::text);

  v := public.crear_reserva('posada-de-precios', v_p1, v_hoy + 50, v_hoy + 52,
         2::smallint, 'Prueba Habilitada', '30111240', 'h@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('con las reservas prendidas se puede reservar',
    (v->>'ok')::boolean = true, v::text);

  v := public.habilitar_reservas(v_complejo, false);
  PERFORM pg_temp.verificar('apagarlas no pregunta nada, porque es a propósito',
    (v->>'habilitadas')::boolean = false
    AND (v->>'pero_no_se_puede_reservar')::boolean = false, v::text);

  v := public.crear_reserva('posada-de-precios', v_p1, v_hoy + 60, v_hoy + 62,
         2::smallint, 'Prueba Apagada', '30111241', 'q@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('y entonces no se puede reservar de verdad',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'reservas_cerradas', v::text);

  PERFORM public.habilitar_reservas(v_complejo, true);

  -- ----------------------------------------------------------------
  -- Las unidades
  -- ----------------------------------------------------------------
  v := public.guardar_unidad(v_complejo, 'p3', 'Pieza Tres', 3::smallint,
         'máx 3, ideal 2 adultos y un chico');
  PERFORM pg_temp.verificar('el dueño puede agregar una unidad',
    (v->>'ok')::boolean = true AND (v->>'era_alta')::boolean = true, v::text);
  PERFORM pg_temp.verificar('el código se guarda en mayúsculas',
    v->>'codigo' = 'P3', v::text);
  -- Sin orden explícito va al final: si todas quedaran en 0, el orden de la
  -- página dependería del orden físico de las filas, que cambia solo.
  PERFORM pg_temp.verificar('y sin orden explícito va al final',
    (v->>'orden')::int = 3, v::text);
  v_id := (v->>'id')::uuid;

  v := public.guardar_unidad(v_complejo, 'P1', 'Repetida', 2::smallint);
  PERFORM pg_temp.verificar('dos unidades con el mismo código no pueden coexistir',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'codigo_repetido', v::text);
  PERFORM pg_temp.verificar('y el mensaje dice cuál es el código',
    v->>'mensaje' LIKE '%P1%', v::text);

  v := public.guardar_unidad(v_complejo, 'P4', 'Para cien', 100::smallint);
  PERFORM pg_temp.verificar('una unidad para cien personas no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'capacidad_invalida', v::text);

  v := public.guardar_unidad(v_complejo, '  ', 'Sin código', 2::smallint);
  PERFORM pg_temp.verificar('ni una sin código',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'faltan_datos', v::text);

  -- Editar.
  v := public.guardar_unidad(v_complejo, 'P3', 'Pieza Tres Grande', 4::smallint,
         NULL, NULL, true, v_id);
  PERFORM pg_temp.verificar('editar una unidad le cambia nombre y capacidad',
    (v->>'ok')::boolean = true AND (v->>'era_alta')::boolean = false
    AND (SELECT nombre = 'Pieza Tres Grande' AND capacidad_maxima = 4
           FROM unidades WHERE id = v_id), v::text);

  -- Y la capacidad es un límite de verdad, no un cartel.
  v := public.crear_reserva('posada-de-precios', v_id, v_hoy + 70, v_hoy + 72,
         9::smallint, 'Prueba Capacidad', '30111242', 'c@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('y nadie puede reservar para más gente de la que entra',
    (v->>'ok')::boolean = false, v::text);

  -- ----------------------------------------------------------------
  -- Sacar de circulación vs. borrar
  -- ----------------------------------------------------------------
  -- Una unidad sin precio: `salud_de_los_precios()` lo tiene que decir, porque
  -- la acabamos de crear activa y sin precio en ningún período.
  PERFORM pg_temp.verificar('una unidad nueva sin precio queda invendible, y se dice',
    EXISTS (SELECT 1 FROM jsonb_array_elements(
              public.salud_de_los_precios(v_complejo)->'unidades_sin_precio') AS e
             WHERE e->>'codigo' = 'P3'));

  v := public.guardar_unidad(v_complejo, 'P3', 'Pieza Tres Grande', 4::smallint,
         NULL, NULL, false, v_id);
  PERFORM pg_temp.verificar('sacarla de circulación la saca del aviso',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                  public.salud_de_los_precios(v_complejo)->'unidades_sin_precio') AS e
                 WHERE e->>'codigo' = 'P3'), v::text);
  PERFORM pg_temp.verificar('y de la página pública',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                  public.complejo_publico('posada-de-precios')->'unidades') AS e
                 WHERE e->>'codigo' = 'P3'));

  -- Borrar una sin reservas sí se puede.
  v := public.borrar_unidad(v_id);
  PERFORM pg_temp.verificar('una unidad sin reservas se puede borrar',
    (v->>'ok')::boolean = true, v::text);

  -- Una con reservas no, y lo dice en vez de tirar un error de Postgres. Eso
  -- sería tirar el historial de la plata que entró.
  v := public.borrar_unidad(v_p1);
  PERFORM pg_temp.verificar('una con reservas no se borra, y dice por qué',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'tiene_reservas', v::text);
  PERFORM pg_temp.verificar('y ofrece sacarla de circulación en vez',
    v->>'mensaje' LIKE '%circulación%', v::text);
  PERFORM pg_temp.verificar('y la unidad sigue ahí con sus reservas',
    (SELECT count(*) = 1 FROM unidades WHERE id = v_p1));

  v := public.borrar_unidad(gen_random_uuid());
  PERFORM pg_temp.verificar('borrar algo que no está lo dice en vez de contestar «listo»',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'no_existe', v::text);

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- Y nada de esto lo puede tocar el vecino.
DO $$
DECLARE
  v_ok    BOOLEAN;
  v_ajena UUID := 'cccccccc-0000-0000-0000-000000000002';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  v_ok := false;
  BEGIN
    PERFORM public.guardar_datos_del_complejo('aaaaaaaa-0000-0000-0000-000000000003',
      'Me lo robo', '5490000000000', 'CBU mío');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('el vecino no puede cambiarle los datos a otro complejo', v_ok);

  v_ok := false;
  BEGIN
    PERFORM public.habilitar_reservas('aaaaaaaa-0000-0000-0000-000000000003', false);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni apagarle las reservas', v_ok);

  v_ok := false;
  BEGIN
    PERFORM public.borrar_unidad(v_ajena);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('ni borrarle una unidad', v_ok);

  -- El agujero que tapa el `complejo_id` del WHERE: la unidad ajena mandada con
  -- el id de un complejo propio. `es_miembro(propio)` da true, así que sin ese
  -- WHERE la edición pasaría.
  v_ok := false;
  BEGIN
    PERFORM public.guardar_unidad('aaaaaaaa-0000-0000-0000-000000000002',
      'ROBADA', 'Robada', 2::smallint, NULL, NULL, true, v_ajena);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('y editar una unidad ajena desde su propio complejo no pasa',
    v_ok OR (SELECT nombre <> 'Robada' FROM unidades WHERE id = v_ajena));

  PERFORM set_config('request.jwt.claim.sub', '', true);

  PERFORM pg_temp.verificar('la unidad ajena quedó como estaba',
    (SELECT nombre FROM unidades WHERE id = v_ajena) = 'Pieza Dos');
  PERFORM pg_temp.verificar('y el complejo ajeno también',
    (SELECT nombre FROM complejos WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003')
      = 'Posada de Precios');
END $$;


-- ============================================
-- 19. El alta de un cliente, de una
-- ============================================
-- Lo que se prueba acá es sobre todo lo que NO queda cuando algo falla: el alta
-- de un complejo son cuatro escrituras en cuatro tablas, y la razón de que sea
-- una función es que o queda todo o no queda nada.
DO $$
DECLARE
  v        JSONB;
  v_id     UUID;
  v_antes  INTEGER;
  v_ok     BOOLEAN;
BEGIN
  SELECT count(*) INTO v_antes FROM complejos;

  -- ----------------------------------------------------------------
  -- Un alta completa
  -- ----------------------------------------------------------------
  v := public.crear_complejo(jsonb_build_object(
    'slug', 'hosteria-de-prueba',
    'nombre', 'Hostería de Prueba',
    'localidad', 'Villa Ejemplo',
    'duenio', '11111111-1111-1111-1111-111111111111',
    'whatsapp', '+54 9 223 555-1111',
    'datos_transferencia', 'Alias: hosteria.prueba',
    'ultima_fecha', (current_date + 300)::text,
    'minimo_noches', 2,
    'unidades', jsonb_build_array(
      jsonb_build_object('codigo', 'h1', 'nombre', 'Habitación Uno', 'capacidad_maxima', 2),
      jsonb_build_object('codigo', 'h2', 'nombre', 'Habitación Dos', 'capacidad_maxima', 4,
                         'sugerencia_ocupacion', 'ideal dos adultos y dos chicos')
    )
  ));
  PERFORM pg_temp.verificar('se puede dar de alta un complejo entero de una',
    (v->>'ok')::boolean = true AND (v->>'unidades')::int = 2, v::text);
  v_id := (v->>'id')::uuid;

  PERFORM pg_temp.verificar('con su dueño ya colgado',
    (SELECT count(*) = 1 FROM complejo_miembros
      WHERE complejo_id = v_id AND user_id = '11111111-1111-1111-1111-111111111111'));
  PERFORM pg_temp.verificar('sus unidades en orden y en mayúsculas',
    (SELECT array_agg(codigo ORDER BY orden) FROM unidades WHERE complejo_id = v_id)
      = ARRAY['H1','H2']);
  PERFORM pg_temp.verificar('y su ventana de reservas cargada',
    (SELECT ultima_fecha = current_date + 300 AND minimo_noches = 2
       FROM config_calendario WHERE complejo_id = v_id));
  PERFORM pg_temp.verificar('el WhatsApp entró limpio, como en el panel',
    (SELECT whatsapp FROM complejos WHERE id = v_id) = '5492235551111');

  -- ----------------------------------------------------------------
  -- Y no vende, y lo dice
  -- ----------------------------------------------------------------
  -- Un alta que contesta «listo» y deja un complejo que no vende nada es la
  -- misma falla que este sistema persigue en todas las otras pantallas.
  PERFORM pg_temp.verificar('las reservas quedan apagadas, porque no hay precios',
    (SELECT NOT reservas_habilitadas FROM complejos WHERE id = v_id));
  PERFORM pg_temp.verificar('y la respuesta dice que falta cargarlos',
    (v->'falta'->>'precios')::boolean = true, v::text);
  PERFORM pg_temp.verificar('y que dónde transferir ya está',
    (v->'falta'->>'donde_transferir')::boolean = false, v::text);

  -- La consecuencia de verdad: la página se abre y no deja reservar.
  PERFORM pg_temp.verificar('la página existe',
    (public.complejo_publico('hosteria-de-prueba')->>'slug') = 'hosteria-de-prueba');
  v := public.crear_reserva('hosteria-de-prueba',
         (SELECT id FROM unidades WHERE complejo_id = v_id ORDER BY orden LIMIT 1),
         current_date + 10, current_date + 13, 2::smallint,
         'Prueba Alta', '30111250', 'alta@ejemplo.test', '5490000000000');
  PERFORM pg_temp.verificar('pero no se puede reservar: las reservas están apagadas',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'reservas_cerradas', v::text);

  -- ----------------------------------------------------------------
  -- El slug, que no se puede corregir después
  -- ----------------------------------------------------------------
  v := public.crear_complejo(jsonb_build_object(
    'slug', 'hosteria-de-prueba', 'nombre', 'Otra',
    'duenio', '11111111-1111-1111-1111-111111111111',
    'ultima_fecha', (current_date + 300)::text,
    'unidades', jsonb_build_array(
      jsonb_build_object('codigo', 'X', 'nombre', 'X', 'capacidad_maxima', 2))
  ));
  PERFORM pg_temp.verificar('dos complejos con la misma dirección no pueden coexistir',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'slug_ocupado', v::text);

  v := public.crear_complejo(jsonb_build_object(
    'slug', 'Cabañas Del Sol', 'nombre', 'Con mayúsculas y espacios',
    'duenio', '11111111-1111-1111-1111-111111111111',
    'ultima_fecha', (current_date + 300)::text,
    'unidades', jsonb_build_array(
      jsonb_build_object('codigo', 'X', 'nombre', 'X', 'capacidad_maxima', 2))
  ));
  PERFORM pg_temp.verificar('una dirección con espacios y acentos no entra',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'slug_invalido', v::text);
  PERFORM pg_temp.verificar('y el mensaje muestra la forma que espera',
    v->>'mensaje' LIKE '%cabanias-del-sol%', v::text);

  -- ----------------------------------------------------------------
  -- Lo que falta no crea nada a medias
  -- ----------------------------------------------------------------
  SELECT count(*) INTO v_antes FROM complejos;

  v := public.crear_complejo(jsonb_build_object(
    'slug', 'sin-unidades', 'nombre', 'Sin unidades',
    'duenio', '11111111-1111-1111-1111-111111111111',
    'ultima_fecha', (current_date + 300)::text,
    'unidades', '[]'::jsonb
  ));
  PERFORM pg_temp.verificar('un complejo sin unidades no se crea',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'sin_unidades', v::text);

  v := public.crear_complejo(jsonb_build_object(
    'slug', 'sin-ventana', 'nombre', 'Sin ventana',
    'duenio', '11111111-1111-1111-1111-111111111111',
    'unidades', jsonb_build_array(
      jsonb_build_object('codigo', 'X', 'nombre', 'X', 'capacidad_maxima', 2))
  ));
  PERFORM pg_temp.verificar('ni uno sin hasta cuándo se puede reservar',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'falta_ultima_fecha', v::text);

  v := public.crear_complejo(jsonb_build_object(
    'slug', 'sin-duenio', 'nombre', 'Sin dueño',
    'duenio', gen_random_uuid(),
    'ultima_fecha', (current_date + 300)::text,
    'unidades', jsonb_build_array(
      jsonb_build_object('codigo', 'X', 'nombre', 'X', 'capacidad_maxima', 2))
  ));
  PERFORM pg_temp.verificar('ni uno cuyo dueño no exista en Auth',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'duenio_inexistente', v::text);

  v := public.crear_complejo(jsonb_build_object(
    'slug', 'duenio-roto', 'nombre', 'Dueño roto',
    'duenio', 'no-soy-un-uuid',
    'ultima_fecha', (current_date + 300)::text,
    'unidades', jsonb_build_array(
      jsonb_build_object('codigo', 'X', 'nombre', 'X', 'capacidad_maxima', 2))
  ));
  PERFORM pg_temp.verificar('un id de dueño que no es un id tampoco revienta',
    (v->>'ok')::boolean = false AND v->>'motivo' = 'falta_duenio', v::text);

  PERFORM pg_temp.verificar('y ninguno de esos cuatro dejó un complejo a medias',
    (SELECT count(*) FROM complejos) = v_antes);

  -- ----------------------------------------------------------------
  -- La transacción: una unidad mal escrita revierte el complejo entero
  -- ----------------------------------------------------------------
  -- Es la razón de que esto sea una función y no cuatro llamadas. Con cuatro
  -- llamadas, acá quedaría un complejo con una unidad y sin calendario.
  v_ok := false;
  BEGIN
    PERFORM public.crear_complejo(jsonb_build_object(
      'slug', 'a-medias', 'nombre', 'A medias',
      'duenio', '11111111-1111-1111-1111-111111111111',
      'ultima_fecha', (current_date + 300)::text,
      'unidades', jsonb_build_array(
        jsonb_build_object('codigo', 'OK', 'nombre', 'Esta está bien', 'capacidad_maxima', 2),
        jsonb_build_object('codigo', '', 'nombre', '', 'capacidad_maxima', 2))
    ));
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('una unidad sin código corta el alta', v_ok);
  PERFORM pg_temp.verificar('y el complejo no quedó creado',
    NOT EXISTS (SELECT 1 FROM complejos WHERE slug = 'a-medias'));
  PERFORM pg_temp.verificar('ni su unidad buena',
    NOT EXISTS (SELECT 1 FROM unidades WHERE codigo = 'OK'));

  -- Y una capacidad imposible la frena el CHECK de la tabla, revirtiendo igual.
  v_ok := false;
  BEGIN
    PERFORM public.crear_complejo(jsonb_build_object(
      'slug', 'capacidad-rota', 'nombre', 'Capacidad rota',
      'duenio', '11111111-1111-1111-1111-111111111111',
      'ultima_fecha', (current_date + 300)::text,
      'unidades', jsonb_build_array(
        jsonb_build_object('codigo', 'Z', 'nombre', 'Z', 'capacidad_maxima', 0))
    ));
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  PERFORM pg_temp.verificar('una capacidad en cero también corta el alta', v_ok);
  PERFORM pg_temp.verificar('y tampoco deja nada',
    NOT EXISTS (SELECT 1 FROM complejos WHERE slug = 'capacidad-rota'));
END $$;

-- Y el complejo recién creado es tan ajeno como cualquier otro.
DO $$
DECLARE
  v_id    UUID;
  v_vistos INTEGER;
BEGIN
  v_id := (SELECT id FROM complejos WHERE slug = 'hosteria-de-prueba');

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  -- `SET LOCAL ROLE authenticated` y no sólo el claim del JWT: esta prueba corre
  -- como superusuario, y a un superusuario RLS no se le aplica. Sin el cambio de
  -- rol, la aserción daba 1 y yo iba a creer que el aislamiento estaba roto. Es
  -- el mismo patrón del bloque 10.
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_vistos FROM complejos WHERE id = v_id;
  RESET ROLE;

  PERFORM pg_temp.verificar('el vecino no ve el complejo recén dado de alta',
    v_vistos = 0, format('vio %s', v_vistos));

  -- Y la función de alta no la puede llamar: no está concedida a su rol. Eso se
  -- comprueba por el permiso, no intentándolo, porque en esta prueba el rol de
  -- la sesión es el superusuario y podría todo.
  PERFORM pg_temp.verificar('y crear_complejo() no está concedida a los dueños',
    NOT has_function_privilege('authenticated', 'public.crear_complejo(jsonb)', 'EXECUTE'));
  PERFORM pg_temp.verificar('ni a los visitantes',
    NOT has_function_privilege('anon', 'public.crear_complejo(jsonb)', 'EXECUTE'));
  PERFORM pg_temp.verificar('y sí al servidor, que es el que da las altas',
    has_function_privilege('service_role', 'public.crear_complejo(jsonb)', 'EXECUTE'));

  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- ============================================
-- Resultado
-- ============================================
\echo ''
-- lpad RECORTA cuando el texto es más largo que el ancho: con 2, la prueba
-- 103 se imprimía como «10», igual que la 104 y la 105. Un número de prueba
-- repetido manda a buscar la prueba equivocada.
SELECT lpad(n::text, 3) || '  ' || CASE WHEN paso THEN 'OK    ' ELSE 'FALLA ' END || nombre ||
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
