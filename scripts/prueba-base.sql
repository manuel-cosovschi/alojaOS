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

  -- El estado de una reserva: sólo estado y vencimiento.
  v := public.estado_reserva((SELECT id FROM reservas WHERE huesped_nombre = 'Ana' LIMIT 1));
  PERFORM pg_temp.verificar('el estado de una reserva no trae nada más',
    (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k) = ARRAY['estado','vence_el'],
    v::text);

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
