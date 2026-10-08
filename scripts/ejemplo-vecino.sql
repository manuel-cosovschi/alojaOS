-- ============================================
-- El complejo vecino
-- ============================================
-- Existe para una sola cosa, y es la más importante del producto: comprobar que
-- un dueño no ve nada del otro.
--
-- El master prompt lo pide así: «si termina siendo multi-inquilino, probá el
-- aislamiento de verdad». Y de verdad significa con dos sesiones distintas, no
-- leyendo las policies y asintiendo. Una policy con un `OR true` olvidado se
-- lee bien.
--
-- Por qué va aparte de `ejemplo.sql`: el de al lado es el complejo que se usa
-- para tocar la página y ver los casos de precio y calendario. Este no tiene
-- nada de eso a propósito —una unidad, un precio, una reserva con datos de una
-- persona— porque lo único que se le pregunta es si se filtra.
--
--   SET alojaos.vecino = '<uuid del segundo dueño>';
--   \i scripts/ejemplo-vecino.sql

INSERT INTO complejos (id, slug, nombre, localidad, provincia, whatsapp,
                       mes_inicio_temporada, porcentaje_sena, horas_vencimiento_sena,
                       reservas_habilitadas, datos_transferencia)
VALUES ('0c0c0c0c-0000-0000-0000-00000000000c', 'posada-vecina', 'Posada Vecina',
        'Otra Villa', 'Buenos Aires', '5490000011111', 12, 30, 24, true,
        E'Alias: posada.vecina\nCBU: 0000003100000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO complejo_miembros (complejo_id, user_id)
VALUES ('0c0c0c0c-0000-0000-0000-00000000000c', current_setting('alojaos.vecino')::uuid)
ON CONFLICT DO NOTHING;

INSERT INTO unidades (id, complejo_id, codigo, nombre, capacidad_maxima, orden)
VALUES ('0d0d0d0d-0000-0000-0000-00000000000d', '0c0c0c0c-0000-0000-0000-00000000000c',
        'VEC1', 'Departamento del fondo', 4, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO config_calendario (complejo_id, primera_fecha, ultima_fecha, minimo_noches)
VALUES ('0c0c0c0c-0000-0000-0000-00000000000c', NULL, '2027-04-30', 2)
ON CONFLICT (complejo_id) DO NOTHING;

-- Una reserva con datos de una persona. Es el dato que la prueba va a buscar
-- desde la sesión del otro dueño: si aparece, el producto no se puede vender.
INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen,
                      huesped_nombre, huesped_telefono, huesped_email, huesped_dni,
                      personas, importe, vence_el)
VALUES ('0c0c0c0c-0000-0000-0000-00000000000c', '0d0d0d0d-0000-0000-0000-00000000000d',
        '2027-02-10', '2027-02-14', 'HOLD_TRANSFER', 'web',
        'Huesped Del Vecino', '5491199998888', 'secreto@ejemplo.test', '40111222',
        3, 480000, now() + interval '20 hours')
ON CONFLICT DO NOTHING;
