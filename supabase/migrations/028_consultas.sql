-- Las consultas de la página de conversión (alojaos.shop/conv).
--
-- Alguien que vino de un anuncio y pidió que le escriban. Las escribe sólo el
-- servidor, con la clave de servicio: no hay ninguna política para `anon` ni
-- para `authenticated`, así que ni el navegador ni el dueño de un complejo
-- pueden leerlas ni tocarlas. Son datos de personas que todavía no son
-- clientes, y lo único que tiene que hacer con ellos el sistema es guardarlos.
--
-- `origen` es la campaña (utm, fbclid, variante): sin eso no hay forma de saber
-- qué anuncio trae consultas que se cierran y cuál trae curiosos.

CREATE TABLE IF NOT EXISTS public.consultas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creada     timestamptz NOT NULL DEFAULT now(),
  nombre     text NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 120),
  complejo   text NOT NULL CHECK (char_length(complejo) BETWEEN 2 AND 160),
  whatsapp   text CHECK (whatsapp IS NULL OR char_length(whatsapp) <= 40),
  email      text CHECK (email IS NULL OR char_length(email) <= 160),
  unidades   text CHECK (unidades IS NULL OR char_length(unidades) <= 40),
  tipo       text NOT NULL CHECK (tipo IN ('demo', 'precio', 'contratar')),
  mensaje    text CHECK (mensaje IS NULL OR char_length(mensaje) <= 1500),
  origen     jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado     text NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'contactada', 'cliente', 'descartada')),
  CHECK (whatsapp IS NOT NULL OR email IS NOT NULL)
);

ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consultas FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS consultas_creada ON public.consultas (creada DESC);
