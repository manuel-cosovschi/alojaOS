-- ============================================
-- AlojaOS — precios por período
-- ============================================
-- Temporada alta, media, baja, fines de semana largos. Cada período tiene su
-- rango de fechas y un precio por unidad.
--
-- En el sistema viejo esto era una data table de n8n con columnas llamadas
-- `LC1`, `LC2`, `LC3`, `LC4`, `LC5`. O sea: los códigos de las cabañas de Las
-- Cañas estaban en el ESQUEMA de los datos, no en los datos. Un complejo con
-- ocho unidades, o con las mismas cinco pero con otros nombres, no entraba sin
-- rehacer la tabla y todos los nodos que la leían. Acá un precio es una fila
-- `(período, unidad, precio)` y la cantidad de unidades deja de importar.

CREATE TABLE periodos_precio (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complejo_id UUID NOT NULL REFERENCES complejos(id) ON DELETE CASCADE,

  desde DATE NOT NULL,
  -- INCLUSIVO: es la última noche que se cobra a este precio. Así lo entendía
  -- la página de reservas (`d0 >= from && d0 <= to`) y así lo cargan los
  -- dueños, que piensan "del 1 al 31 de enero". Cambiarlo a exclusivo ahora
  -- correría todos los períodos ya cargados un día.
  hasta DATE NOT NULL,
  CHECK (desde <= hasta),

  etiqueta TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dos períodos que se pisan dejan el precio de una noche a suerte del orden en
-- que se lean las filas. El workflow de n8n validaba esto a mano antes de
-- escribir; acá no se puede escribir mal.
--
-- '[]' acá y no '[)' como en las reservas: `hasta` es inclusivo, así que un
-- período que termina el 31 y otro que empieza el 31 SÍ se pisan — las dos
-- filas reclaman la noche del 31.
ALTER TABLE periodos_precio ADD CONSTRAINT periodos_sin_solape
  EXCLUDE USING gist (complejo_id WITH =, daterange(desde, hasta, '[]') WITH &&);

CREATE INDEX periodos_precio_complejo_idx ON periodos_precio (complejo_id, desde);

CREATE TABLE precios_unidad (
  periodo_id UUID NOT NULL REFERENCES periodos_precio(id) ON DELETE CASCADE,
  unidad_id  UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  precio     NUMERIC(12,2) NOT NULL CHECK (precio > 0),
  PRIMARY KEY (periodo_id, unidad_id)
);

CREATE INDEX precios_unidad_unidad_idx ON precios_unidad (unidad_id);

CREATE TRIGGER periodos_precio_tocar BEFORE UPDATE ON periodos_precio
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

-- ============================================
-- Cotizar una estadía
-- ============================================
-- Cada noche se cobra según su propia fecha: una estadía que cruza de temporada
-- media a alta paga parte a cada precio. Esto ya estaba bien resuelto en
-- `calcStayTotal()` de reservar.html y se traduce igual.
--
-- Lo importante es lo que hace cuando falta un precio: NO cotiza. Devuelve
-- NULL en vez de inventar un número o saltear la noche. El comentario original
-- explica por qué, y vale copiarlo: «cobrar de menos sin que nadie se entere es
-- peor que pedirle a la persona que espere la confirmación».
--
-- Vive en la base además de en TypeScript porque la cotización que se guarda en
-- la reserva no puede depender de lo que calculó un navegador: el precio que
-- llega en el pedido es un dato del cliente, y un dato del cliente no se cree.
CREATE OR REPLACE FUNCTION public.cotizar_estadia(
  p_unidad    UUID,
  p_check_in  DATE,
  p_check_out DATE
)
RETURNS JSONB
LANGUAGE plpgsql
-- SECURITY DEFINER porque la llama la página pública, y el rol anónimo no
-- tiene permiso de lectura sobre `periodos_precio` ni sobre `unidades`. Sin
-- esto el GRANT de más abajo es mentira: la función está concedida pero
-- revienta con "permission denied" en la primera consulta, así que la página
-- recibiría un 500 en vez de un precio.
--
-- No expone nada nuevo: los precios de un complejo ya son públicos, los
-- muestra `complejo_publico()`. Lo que hace es que el único camino a ellos sea
-- este, con las fechas y la unidad como argumentos.
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_complejo   UUID;
  v_noches     INTEGER;
  v_dia        DATE;
  v_precio     NUMERIC(12,2);
  v_total      NUMERIC(12,2) := 0;
  v_min        NUMERIC(12,2);
  v_max        NUMERIC(12,2);
  v_porcentaje NUMERIC(5,2);
BEGIN
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_in >= p_check_out THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fechas_invalidas');
  END IF;

  SELECT u.complejo_id, c.porcentaje_sena
    INTO v_complejo, v_porcentaje
    FROM unidades u JOIN complejos c ON c.id = u.complejo_id
   WHERE u.id = p_unidad;

  IF v_complejo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'unidad_inexistente');
  END IF;

  v_noches := p_check_out - p_check_in;
  v_dia := p_check_in;

  -- Se recorre noche por noche en vez de agrupar por período, porque es la
  -- forma en que la regla se lee igual que se escribió: cada noche busca su
  -- precio y si no lo encuentra, no hay estadía que cotizar.
  WHILE v_dia < p_check_out LOOP
    SELECT pu.precio INTO v_precio
      FROM periodos_precio p
      JOIN precios_unidad pu ON pu.periodo_id = p.id AND pu.unidad_id = p_unidad
     WHERE p.complejo_id = v_complejo
       AND v_dia BETWEEN p.desde AND p.hasta
     LIMIT 1;

    IF v_precio IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'motivo', 'noche_sin_precio',
        'noche', v_dia
      );
    END IF;

    v_total := v_total + v_precio;
    v_min := least(coalesce(v_min, v_precio), v_precio);
    v_max := greatest(coalesce(v_max, v_precio), v_precio);
    v_dia := v_dia + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'noches', v_noches,
    'total', v_total,
    'sena', round(v_total * v_porcentaje / 100),
    'precio_min', v_min,
    'precio_max', v_max
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cotizar_estadia(UUID, DATE, DATE) TO anon, authenticated;

-- ============================================
-- RLS
-- ============================================
ALTER TABLE periodos_precio ENABLE ROW LEVEL SECURITY;
ALTER TABLE precios_unidad  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "miembros manejan sus períodos" ON periodos_precio
  FOR ALL USING (es_miembro(complejo_id)) WITH CHECK (es_miembro(complejo_id));

CREATE POLICY "miembros manejan sus precios" ON precios_unidad
  FOR ALL USING (es_miembro(complejo_de_unidad(unidad_id)))
  WITH CHECK (es_miembro(complejo_de_unidad(unidad_id)));
