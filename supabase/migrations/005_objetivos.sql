-- ============================================
-- AlojaOS — el objetivo de la temporada
-- ============================================
-- Cuánto se quiere facturar en la temporada y cuánto lleva. Es la sección
-- Números del panel, y es el dato que el dueño mira primero.
--
-- Una temporada se identifica por el año en que ARRANCA: la 2026-2027 es 2026.
-- Cuándo arranca lo dice `complejos.mes_inicio_temporada` — en Las Cañas estaba
-- fijo en diciembre dentro de `temporadaDe()`, y en un complejo de montaña la
-- temporada es el invierno.

CREATE TABLE objetivos_temporada (
  complejo_id UUID NOT NULL REFERENCES complejos(id) ON DELETE CASCADE,
  temporada   SMALLINT NOT NULL CHECK (temporada BETWEEN 2000 AND 2100),
  objetivo    NUMERIC(14,2) NOT NULL CHECK (objetivo > 0),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (complejo_id, temporada)
);

CREATE TRIGGER objetivos_tocar BEFORE UPDATE ON objetivos_temporada
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

-- ============================================
-- A qué temporada pertenece una fecha
-- ============================================
-- La misma cuenta que hacía `temporadaDe()` en el panel, pero con el mes de
-- arranque como dato del complejo en vez de como constante.
--
-- Con arranque en diciembre: diciembre de 2026 es la temporada 2026, y enero de
-- 2027 también (es la misma temporada, ya empezada). Con arranque en junio:
-- junio de 2026 es la 2026, mayo de 2026 es la 2025.
CREATE OR REPLACE FUNCTION public.temporada_de(p_complejo UUID, p_fecha DATE)
RETURNS SMALLINT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
           WHEN extract(month FROM p_fecha) >= c.mes_inicio_temporada
             THEN extract(year FROM p_fecha)
             ELSE extract(year FROM p_fecha) - 1
         END::SMALLINT
    FROM complejos c
   WHERE c.id = p_complejo;
$$;

-- Cuando la temporada arranca en enero no hay corte: el año calendario y la
-- temporada son lo mismo, y la cuenta de arriba lo da bien sola.

ALTER TABLE objetivos_temporada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "miembros manejan sus objetivos" ON objetivos_temporada
  FOR ALL USING (es_miembro(complejo_id)) WITH CHECK (es_miembro(complejo_id));
