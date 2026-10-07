-- ============================================
-- AlojaOS — las reglas del calendario
-- ============================================
-- Hasta cuándo se puede reservar, cuántas noches como mínimo, y qué bloques van
-- enteros o no van (los fines de semana largos, que el dueño no quiere partir).
--
-- Venía de la data table `config_calendario` de n8n, y la validación la hacía
-- un nodo antes de escribir. Acá las reglas que se podían romper al cargar son
-- restricciones.

-- ============================================
-- La ventana de reservas y el mínimo general
-- ============================================
-- Una fila por complejo. Va en su propia tabla y no en columnas de `complejos`
-- porque son las reglas de la temporada, se cambian juntas y de otra persona
-- (el dueño las toca cada año; su marca, nunca).
CREATE TABLE config_calendario (
  complejo_id UUID PRIMARY KEY REFERENCES complejos(id) ON DELETE CASCADE,

  -- Desde cuándo se puede pedir una noche. NULL = desde hoy. La página sólo
  -- avisa "disponible desde" si esta fecha todavía no llegó: "disponible desde
  -- hoy" no le dice nada a nadie.
  primera_fecha DATE,
  -- Hasta cuándo. Sin esto no sabemos qué contestarle a quien pide enero del
  -- año que viene, y la página se planta antes que inventar una regla.
  ultima_fecha  DATE NOT NULL,

  minimo_noches SMALLINT NOT NULL DEFAULT 1 CHECK (minimo_noches BETWEEN 1 AND 30),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (primera_fecha IS NULL OR primera_fecha <= ultima_fecha)
);

-- ============================================
-- Bloques que van enteros
-- ============================================
-- El finde largo que se alquila completo: o se toma de viernes a lunes, o no se
-- toma. Si se pudieran partir, el dueño queda con la noche del domingo suelta,
-- que no le va a alquilar a nadie.
CREATE TABLE bloques_fijos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complejo_id UUID NOT NULL REFERENCES complejos(id) ON DELETE CASCADE,

  check_in  DATE NOT NULL,
  check_out DATE NOT NULL,
  etiqueta  TEXT,
  CHECK (check_in < check_out)
);

-- Dos bloques fijos que se pisan son dos reglas contradictorias sobre la misma
-- noche, y la página no tendría forma de elegir cuál aplicar.
ALTER TABLE bloques_fijos ADD CONSTRAINT bloques_sin_solape
  EXCLUDE USING gist (complejo_id WITH =, daterange(check_in, check_out, '[)') WITH &&);

CREATE INDEX bloques_fijos_complejo_idx ON bloques_fijos (complejo_id, check_in);

-- ============================================
-- Mínimos por tramo
-- ============================================
-- "En enero, cuatro noches mínimo". Pisa al mínimo general mientras dura.
CREATE TABLE minimos_noches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complejo_id UUID NOT NULL REFERENCES complejos(id) ON DELETE CASCADE,

  desde  DATE NOT NULL,
  hasta  DATE NOT NULL,   -- inclusivo, igual que en los períodos de precio
  noches SMALLINT NOT NULL CHECK (noches BETWEEN 1 AND 30),
  etiqueta TEXT,
  CHECK (desde <= hasta),

  -- Qué días se puede entrar en este tramo (0 = domingo … 6 = sábado).
  -- NULL = cualquier día.
  --
  -- Esto existe porque en la página de Las Cañas la temporada alta estaba
  -- ESCRITA EN EL CÓDIGO: una constante `TEMPORADA_ALTA` con 20/12 al 1/3, 7
  -- noches mínimo y check-in sólo sábado o domingo. Era una regla del negocio
  -- de ese complejo metida en el programa, y el complejo siguiente tiene otra
  -- temporada, otro mínimo y puede no exigir día de entrada.
  --
  -- La regla vieja comparaba mes y día para poder cruzar el año nuevo. Acá se
  -- carga como un tramo concreto por temporada (20/12/2026 → 1/3/2027), que es
  -- el mismo gesto que ya hacen con los precios y evita la clase entera de
  -- errores de comparar fechas sin año.
  dias_checkin SMALLINT[] CHECK (
    dias_checkin IS NULL OR (
      array_length(dias_checkin, 1) BETWEEN 1 AND 7
      AND dias_checkin <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]
    )
  )
);

ALTER TABLE minimos_noches ADD CONSTRAINT minimos_sin_solape
  EXCLUDE USING gist (complejo_id WITH =, daterange(desde, hasta, '[]') WITH &&);

CREATE INDEX minimos_noches_complejo_idx ON minimos_noches (complejo_id, desde);

CREATE TRIGGER config_calendario_tocar BEFORE UPDATE ON config_calendario
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE config_calendario ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloques_fijos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE minimos_noches    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "miembros manejan su calendario" ON config_calendario
  FOR ALL USING (es_miembro(complejo_id)) WITH CHECK (es_miembro(complejo_id));
CREATE POLICY "miembros manejan sus bloques" ON bloques_fijos
  FOR ALL USING (es_miembro(complejo_id)) WITH CHECK (es_miembro(complejo_id));
CREATE POLICY "miembros manejan sus mínimos" ON minimos_noches
  FOR ALL USING (es_miembro(complejo_id)) WITH CHECK (es_miembro(complejo_id));
