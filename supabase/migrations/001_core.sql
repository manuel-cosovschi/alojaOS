-- ============================================
-- AlojaOS — el complejo y sus unidades
-- ============================================
-- Un complejo es un inquilino: su marca, su contacto, sus unidades, sus
-- precios, sus reservas. Todo lo demás cuelga de acá con `complejo_id` y las
-- policies aíslan por pertenencia.
--
-- La identidad del complejo es una FILA, no un archivo de configuración. En el
-- sistema de Las Cañas el nombre, el WhatsApp y la paleta estaban escritos en
-- 30 archivos distintos; acá no hay dónde escribirlos salvo esta tabla. El
-- chequeo `npm run sin-marca` falla si alguien vuelve a poner una marca en el
-- código.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================
-- Complejos
-- ============================================
CREATE TABLE IF NOT EXISTS complejos (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- El subdominio: `tucomplejo` en tucomplejo.alojaos.shop. Inmutable una vez
  -- creado (migración 007): los links que el dueño mandó por WhatsApp a sus
  -- huéspedes no pueden dejar de funcionar porque cambió el nombre de fantasía.
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 40),

  nombre       TEXT NOT NULL,
  nombre_corto TEXT,
  descripcion  TEXT,

  localidad TEXT,
  provincia TEXT,
  pais      TEXT NOT NULL DEFAULT 'Argentina',
  direccion TEXT,
  lat       NUMERIC(9,6),
  lng       NUMERIC(9,6),

  -- Un solo número, el que la página muestra y al que se manda el huésped que
  -- quiere hablar con una persona. Sin `+` ni espacios.
  whatsapp  TEXT,
  instagram TEXT,
  email     TEXT,

  -- Marca. Son los cuatro colores y las dos tipografías que en Las Cañas
  -- estaban repetidos inline en cinco HTML, porque usaban Tailwind por CDN.
  color_principal TEXT NOT NULL DEFAULT '#1F2937',
  color_fondo     TEXT NOT NULL DEFAULT '#F8F7F4',
  color_texto     TEXT NOT NULL DEFAULT '#111827',
  color_acento    TEXT NOT NULL DEFAULT '#B45309',
  tipografia_titulos TEXT,
  tipografia_cuerpo  TEXT,
  logo_path TEXT,

  -- En qué mes arranca la temporada. En Las Cañas estaba fijo en diciembre
  -- (`temporadaDe()` en admin.html); en un complejo de montaña puede ser junio.
  mes_inicio_temporada SMALLINT NOT NULL DEFAULT 12
    CHECK (mes_inicio_temporada BETWEEN 1 AND 12),

  moneda       TEXT NOT NULL DEFAULT 'ARS',
  zona_horaria TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',

  -- Cuánto se pide de seña y cuánto dura el lugar guardado mientras el huésped
  -- transfiere. En Las Cañas eran 50% y 6 horas, escritos en el código.
  porcentaje_sena          NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (porcentaje_sena > 0 AND porcentaje_sena <= 100),
  horas_vencimiento_sena   SMALLINT NOT NULL DEFAULT 6 CHECK (horas_vencimiento_sena BETWEEN 1 AND 168),

  -- Apaga el alta pública sin apagar el panel: sirve para cuando el dueño
  -- todavía está cargando precios y no quiere recibir reservas.
  reservas_habilitadas BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Unidades
-- ============================================
-- Una cabaña, un departamento, una habitación. El código lo elige el dueño
-- (en Las Cañas eran LC1..LC5); el sistema no asume ni cuántas son ni cómo se
-- llaman. En la planilla vieja los precios eran COLUMNAS llamadas LC1..LC5, así
-- que un complejo con ocho unidades no entraba sin cambiar el esquema.
CREATE TABLE IF NOT EXISTS unidades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complejo_id UUID NOT NULL REFERENCES complejos(id) ON DELETE CASCADE,

  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,

  capacidad_maxima SMALLINT NOT NULL CHECK (capacidad_maxima > 0 AND capacidad_maxima <= 50),
  -- La frase que el dueño le dice al huésped: "máx 4, ideal 2 adultos y 2
  -- niños". Venía de HOUSE_RULES en reservar.html.
  sugerencia_ocupacion TEXT,

  orden  SMALLINT NOT NULL DEFAULT 0,
  activa BOOLEAN  NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (complejo_id, codigo)
);

CREATE INDEX IF NOT EXISTS unidades_complejo_idx ON unidades (complejo_id, orden);

-- ============================================
-- Quién puede entrar al panel de un complejo
-- ============================================
-- En Las Cañas había un ADMIN_USER y un ADMIN_PASS por sitio: todos los dueños
-- compartían la misma clave y no quedaba registro de quién hizo qué. Acá cada
-- persona es un usuario y se la cuelga del complejo.
CREATE TABLE IF NOT EXISTS complejo_miembros (
  complejo_id UUID NOT NULL REFERENCES complejos(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol         TEXT NOT NULL DEFAULT 'dueño' CHECK (rol IN ('dueño', 'encargado')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (complejo_id, user_id)
);

CREATE INDEX IF NOT EXISTS complejo_miembros_user_idx ON complejo_miembros (user_id);

-- ============================================
-- Helpers de pertenencia
-- ============================================
-- SECURITY DEFINER y STABLE: las policies de todas las tablas la llaman, y si
-- leyera `complejo_miembros` con RLS puesto se llamaría a sí misma.
CREATE OR REPLACE FUNCTION public.es_miembro(p_complejo UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM complejo_miembros m
     WHERE m.complejo_id = p_complejo
       AND m.user_id = auth.uid()
  );
$$;

-- A qué complejo pertenece una unidad. La usan las policies de las tablas que
-- cuelgan de `unidades` y no llevan `complejo_id` propio.
CREATE OR REPLACE FUNCTION public.complejo_de_unidad(p_unidad UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT complejo_id FROM unidades WHERE id = p_unidad;
$$;

CREATE OR REPLACE FUNCTION public.tocar_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER complejos_tocar BEFORE UPDATE ON complejos
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();
CREATE TRIGGER unidades_tocar BEFORE UPDATE ON unidades
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE complejos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades          ENABLE ROW LEVEL SECURITY;
ALTER TABLE complejo_miembros ENABLE ROW LEVEL SECURITY;

-- Los miembros ven y editan su complejo. Nadie crea complejos desde el
-- navegador: eso lo hace el alta con la service role (migración 008).
CREATE POLICY "miembros leen su complejo" ON complejos
  FOR SELECT USING (es_miembro(id));
CREATE POLICY "miembros editan su complejo" ON complejos
  FOR UPDATE USING (es_miembro(id)) WITH CHECK (es_miembro(id));

CREATE POLICY "miembros manejan sus unidades" ON unidades
  FOR ALL USING (es_miembro(complejo_id)) WITH CHECK (es_miembro(complejo_id));

-- Cada uno ve su propia membresía, para saber de qué complejo es. Agregar o
-- sacar gente no se hace desde el navegador.
CREATE POLICY "cada uno ve su membresía" ON complejo_miembros
  FOR SELECT USING (user_id = auth.uid());
