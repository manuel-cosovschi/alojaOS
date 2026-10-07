-- ============================================
-- AlojaOS — un complejo de ejemplo
-- ============================================
-- Lo carga `scripts/dev-local.sh` para poder tocar la página de reservas.
--
-- El complejo es inventado, y tiene que seguir siéndolo: `npm run sin-marca`
-- falla si acá apareciera el nombre, el teléfono o la paleta de un cliente de
-- verdad. Los datos están elegidos para que la página muestre los casos que
-- importan, no para que se vea linda:
--
--   - dos períodos de precio pegados, así una estadía que los cruza paga parte
--     a cada precio;
--   - un tramo con mínimo de 7 noches y entrada sólo sábado o domingo, que es
--     la regla que en el sistema anterior estaba escrita en el código;
--   - un bloque que se alquila entero;
--   - noches ya ocupadas, una confirmada y una con la seña viva, para ver el
--     calendario tachado, con teléfonos que no se parezcan al del complejo: si
--     fueran un trozo de él, la prueba que busca filtraciones daría un falso
--     positivo contra el propio WhatsApp público;
--   - y una unidad sin precio en un período, para ver qué hace la página cuando
--     no puede cotizar.

INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'duenio@ejemplo.test');

INSERT INTO complejos (
  id, slug, nombre, nombre_corto, descripcion,
  localidad, provincia, direccion, lat, lng,
  whatsapp, instagram, email,
  color_principal, color_fondo, color_texto, color_acento,
  mes_inicio_temporada, porcentaje_sena, horas_vencimiento_sena, reservas_habilitadas
) VALUES (
  '0a0a0a0a-0000-0000-0000-00000000000a',
  'cabanias-del-sol',
  'Cabañas del Sol',
  'Del Sol',
  'Cuatro cabañas a dos cuadras del mar, con parrilla y pileta compartida.',
  'Villa Ejemplo', 'Buenos Aires', 'Calle Falsa 123', -37.123456, -57.123456,
  '5490000000000', '@cabaniasdelsol', 'hola@ejemplo.test',
  '#2f5d50', '#f6f4ef', '#1b2b26', '#c2703d',
  12, 50, 6, true
);

INSERT INTO complejo_miembros (complejo_id, user_id)
VALUES ('0a0a0a0a-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111');

INSERT INTO unidades (id, complejo_id, codigo, nombre, capacidad_maxima, sugerencia_ocupacion, orden) VALUES
  ('0b0b0b0b-0000-0000-0000-00000000000b', '0a0a0a0a-0000-0000-0000-00000000000a',
   'SOL1', 'Cabaña del Ceibo', 4, 'Máximo 4 personas, ideal 2 adultos y 2 chicos.', 1),
  ('0b0b0b0b-0000-0000-0000-00000000000c', '0a0a0a0a-0000-0000-0000-00000000000a',
   'SOL2', 'Cabaña del Aljibe', 6, 'Máximo 4 adultos y 2 chicos.', 2),
  ('0b0b0b0b-0000-0000-0000-00000000000d', '0a0a0a0a-0000-0000-0000-00000000000a',
   'SOL3', 'Cabaña del Molle', 2, 'Para dos.', 3),
  -- Esta queda sin precio en la temporada alta, a propósito: es el caso en que
  -- la página no puede cotizar y tiene que decirlo en vez de inventar un número.
  ('0b0b0b0b-0000-0000-0000-00000000000e', '0a0a0a0a-0000-0000-0000-00000000000a',
   'SOL4', 'Cabaña del Tala', 4, 'Máximo 4 personas.', 4);

-- ============================================
-- El calendario
-- ============================================
INSERT INTO config_calendario (complejo_id, primera_fecha, ultima_fecha, minimo_noches)
VALUES ('0a0a0a0a-0000-0000-0000-00000000000a', NULL, '2027-04-30', 2);

-- La ex-constante de temporada alta: 7 noches, entrando sábado o domingo.
INSERT INTO minimos_noches (complejo_id, desde, hasta, noches, etiqueta, dias_checkin)
VALUES ('0a0a0a0a-0000-0000-0000-00000000000a', '2026-12-20', '2027-03-01', 7,
        'temporada alta', ARRAY[6,0]::SMALLINT[]);

-- Un bloque que se alquila completo.
INSERT INTO bloques_fijos (complejo_id, check_in, check_out, etiqueta)
VALUES ('0a0a0a0a-0000-0000-0000-00000000000a', '2026-11-20', '2026-11-24', 'fin de semana largo');

-- ============================================
-- Los precios
-- ============================================
WITH media AS (
  INSERT INTO periodos_precio (complejo_id, desde, hasta, etiqueta)
  VALUES ('0a0a0a0a-0000-0000-0000-00000000000a', '2026-10-01', '2026-12-19', 'temporada media')
  RETURNING id
)
INSERT INTO precios_unidad (periodo_id, unidad_id, precio)
SELECT media.id, u.id,
       CASE u.codigo WHEN 'SOL1' THEN 72000 WHEN 'SOL2' THEN 95000
                     WHEN 'SOL3' THEN 54000 ELSE 72000 END
  FROM media CROSS JOIN unidades u
 WHERE u.complejo_id = '0a0a0a0a-0000-0000-0000-00000000000a';

WITH alta AS (
  INSERT INTO periodos_precio (complejo_id, desde, hasta, etiqueta)
  VALUES ('0a0a0a0a-0000-0000-0000-00000000000a', '2026-12-20', '2027-03-01', 'temporada alta')
  RETURNING id
)
INSERT INTO precios_unidad (periodo_id, unidad_id, precio)
SELECT alta.id, u.id,
       CASE u.codigo WHEN 'SOL1' THEN 148000 WHEN 'SOL2' THEN 195000
                     WHEN 'SOL3' THEN 110000 END
  FROM alta CROSS JOIN unidades u
 WHERE u.complejo_id = '0a0a0a0a-0000-0000-0000-00000000000a'
   -- SOL4 queda afuera a propósito.
   AND u.codigo <> 'SOL4';

-- ============================================
-- Noches ya tomadas
-- ============================================
-- Una confirmada, una con la seña viva y un bloqueo del dueño: los tres ocupan,
-- y en el calendario se ven iguales porque para quien busca fechas es lo mismo.
INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen,
                      huesped_nombre, huesped_telefono, personas, importe, vence_el)
VALUES
  ('0a0a0a0a-0000-0000-0000-00000000000a', '0b0b0b0b-0000-0000-0000-00000000000b',
   '2027-01-09', '2027-01-16', 'CONFIRMED', 'manual', 'Reserva de ejemplo', '5491133334444', 4, 1036000, NULL),
  ('0a0a0a0a-0000-0000-0000-00000000000a', '0b0b0b0b-0000-0000-0000-00000000000c',
   '2027-01-16', '2027-01-23', 'HOLD_TRANSFER', 'web', 'Seña de ejemplo', '5491155556666', 5, 1365000,
   now() + interval '4 hours');

INSERT INTO reservas (complejo_id, unidad_id, check_in, check_out, estado, origen, motivo_estado)
VALUES ('0a0a0a0a-0000-0000-0000-00000000000a', '0b0b0b0b-0000-0000-0000-00000000000b',
        '2027-02-07', '2027-02-14', 'BLOCKED', 'bloqueo', 'La usa la familia.');

INSERT INTO objetivos_temporada (complejo_id, temporada, objetivo)
VALUES ('0a0a0a0a-0000-0000-0000-00000000000a', 2026, 18000000);
