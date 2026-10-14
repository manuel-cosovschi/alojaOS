-- ============================================
-- La marca del complejo, cargada por el dueño
-- ============================================
-- Los cuatro colores y las dos tipografías. En Las Cañas estaban repetidos
-- inline en cinco HTML; la 001 los convirtió en columnas, y hasta hoy los
-- cargaba yo.
--
-- ------------------------------------------------------------------
-- Por qué esto no es un `UPDATE` cualquiera
-- ------------------------------------------------------------------
-- Estos seis valores NO son datos que se muestran: son **CSS que se ejecuta**.
-- `src/app/page.tsx` los pone como propiedades personalizadas en el `style` del
-- contenedor de la página, y de ahí los leen `background`, `color` y
-- `font-family`.
--
-- React las setea por el CSSOM, así que no se puede «cerrar la declaración» y
-- escribir otra regla. Pero un valor arbitrario igual puede hacer algo: un
-- `url(https://…)` en un contexto de `background` hace que el navegador de cada
-- huésped que entre a esa página pida ese recurso. Es la página del propio
-- dueño, así que no es una escalada contra nadie más, pero el campo existe para
-- guardar un color y no tiene por qué aceptar otra cosa.
--
-- Así que los colores se validan como hexadecimal y nada más, y las tipografías
-- salen de una **lista cerrada**. No es paranoia: es que el conjunto de valores
-- útiles para estos campos es chico y conocido, y cuando eso pasa, aceptar
-- texto libre sólo agrega formas de equivocarse.
--
-- ------------------------------------------------------------------
-- Por qué la lista de tipografías no tiene fuentes web
-- ------------------------------------------------------------------
-- Las seis opciones son pilas de fuentes del sistema. Cargar una fuente de
-- Google Fonts haría que el navegador de cada huésped pida un archivo a un
-- tercero —o sea, le cuenta a ese tercero quién visitó la página del complejo—,
-- y además mueve el texto cuando termina de cargar. Para una página de reservas
-- que se abre desde un celular con mala señal, las dos cosas son peores que
-- usar la fuente que el teléfono ya tiene.

-- Las tipografías que se pueden elegir, con su pila de CSS.
--
-- Va como función y no como tabla porque es una lista de seis que cambia cuando
-- cambia el diseño del producto, no cuando un cliente hace algo. Una tabla
-- pediría migraciones de datos para agregar una opción.
CREATE OR REPLACE FUNCTION public.tipografias_disponibles()
RETURNS TABLE (clave TEXT, nombre TEXT, pila TEXT)
LANGUAGE sql
IMMUTABLE
-- No lee ninguna tabla, así que el `search_path` no le cambia nada. Va igual
-- porque `prueba-base.sql` exige que TODAS las funciones del esquema lo fijen, y
-- una regla con excepciones deja de ser comprobable: la próxima excepción es la
-- que sí importa.
SET search_path = public
AS $$
  SELECT * FROM (VALUES
    ('sistema',  'La del sistema',      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'),
    ('serif',    'Con serifas',         'ui-serif, Georgia, Cambria, Times New Roman, serif'),
    ('redonda',  'Redonda',             'Avenir Next, Avenir, Nunito, ui-rounded, system-ui, sans-serif'),
    ('estrecha', 'Estrecha',            'Oswald, Arial Narrow, Helvetica Neue Condensed, ui-sans-serif, sans-serif'),
    ('clasica',  'Clásica',             'Palatino Linotype, Palatino, Book Antiqua, ui-serif, Georgia, serif'),
    ('maquina',  'De máquina',          'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace')
  ) AS t(clave, nombre, pila);
$$;

-- ============================================
-- Guardar la marca
-- ============================================
-- Los seis juntos, porque el dueño los elige mirando el resultado de los seis a
-- la vez. Guardar de a uno le haría ver cinco estados intermedios que no eligió.
CREATE OR REPLACE FUNCTION public.guardar_marca(
  p_complejo   UUID,
  p_principal  TEXT,
  p_fondo      TEXT,
  p_texto      TEXT,
  p_acento     TEXT,
  p_titulos    TEXT DEFAULT NULL,
  p_cuerpo     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colores JSONB := '{}'::JSONB;
  v_nombre  TEXT;
  v_valor   TEXT;
  v_titulos TEXT;
  v_cuerpo  TEXT;
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Los cuatro colores, uno por uno, para poder nombrar el que está mal.
  FOR v_nombre, v_valor IN
    SELECT * FROM (VALUES
      ('principal', p_principal), ('fondo', p_fondo),
      ('texto', p_texto), ('acento', p_acento)
    ) AS t(n, v)
  LOOP
    v_valor := lower(btrim(coalesce(v_valor, '')));

    -- `#abc` es CSS válido y abrevia `#aabbcc`. Se acepta y se normaliza, así
    -- la base guarda una sola forma y comparar dos marcas es comparar texto.
    IF v_valor ~ '^#[0-9a-f]{3}$' THEN
      v_valor := '#' || repeat(substr(v_valor, 2, 1), 2)
                     || repeat(substr(v_valor, 3, 1), 2)
                     || repeat(substr(v_valor, 4, 1), 2);
    END IF;

    IF v_valor !~ '^#[0-9a-f]{6}$' THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'color_invalido',
        'mensaje', format('El color %s tiene que ser hexadecimal, como #1f2937. Vino «%s».',
          v_nombre, coalesce(nullif(btrim(coalesce(v_valor, '')), ''), '(vacío)')));
    END IF;

    v_colores := v_colores || jsonb_build_object(v_nombre, v_valor);
  END LOOP;

  -- Las tipografías por clave, nunca por pila de CSS: lo que entra acá termina
  -- en un `font-family` del navegador del huésped. Ver el encabezado.
  IF p_titulos IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tipografias_disponibles() WHERE clave = p_titulos) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tipografia_invalida',
      'mensaje', format('«%s» no es una de las tipografías disponibles.', p_titulos));
  END IF;
  IF p_cuerpo IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tipografias_disponibles() WHERE clave = p_cuerpo) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tipografia_invalida',
      'mensaje', format('«%s» no es una de las tipografías disponibles.', p_cuerpo));
  END IF;

  SELECT pila INTO v_titulos FROM public.tipografias_disponibles() WHERE clave = p_titulos;
  SELECT pila INTO v_cuerpo  FROM public.tipografias_disponibles() WHERE clave = p_cuerpo;

  UPDATE complejos SET
    color_principal = v_colores->>'principal',
    color_fondo     = v_colores->>'fondo',
    color_texto     = v_colores->>'texto',
    color_acento    = v_colores->>'acento',
    tipografia_titulos = v_titulos,
    tipografia_cuerpo  = v_cuerpo
  WHERE id = p_complejo;

  RETURN jsonb_build_object(
    'ok', true,
    'colores', v_colores,
    -- El contraste entre el texto y el fondo, para que la pantalla pueda
    -- avisar. Ver `contraste_wcag()` abajo: un dueño puede elegir dos colores
    -- que se vean bien en su monitor y dejen la página ilegible al sol, y nadie
    -- se lo va a decir —el que no pudo leer la página se fue—.
    'contraste', public.contraste_wcag(v_colores->>'texto', v_colores->>'fondo')
  );
END;
$$;

-- ============================================
-- El contraste entre dos colores
-- ============================================
-- La fórmula de WCAG 2.1: la relación entre las luminancias relativas. 4.5 es el
-- mínimo para texto normal, 3 para texto grande.
--
-- Vive en la base y no en TypeScript porque la usa `guardar_marca()` para
-- contestar en el mismo momento en que el dueño guarda, y porque es la clase de
-- cuenta que si está en dos lugares, en uno de los dos queda vieja.
--
-- Esto NO rechaza nada. Un dueño puede querer un contraste bajo y es su página.
-- Lo que no puede pasar es que elija un contraste ilegible sin que nadie se lo
-- diga: la página se ve bien en el monitor donde se eligió y no se lee en un
-- celular al sol, y el que no pudo leerla no escribe para avisar.
CREATE OR REPLACE FUNCTION public.contraste_wcag(p_a TEXT, p_b TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_la NUMERIC;
  v_lb NUMERIC;
BEGIN
  v_la := public.luminancia_relativa(p_a);
  v_lb := public.luminancia_relativa(p_b);
  IF v_la IS NULL OR v_lb IS NULL THEN RETURN NULL; END IF;

  RETURN round((greatest(v_la, v_lb) + 0.05) / (least(v_la, v_lb) + 0.05), 2);
END;
$$;

-- La luminancia relativa de un `#rrggbb`, según WCAG 2.1.
CREATE OR REPLACE FUNCTION public.luminancia_relativa(p_hex TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_hex TEXT := lower(btrim(coalesce(p_hex, '')));
  v_c   NUMERIC[];
  v_l   NUMERIC[] := ARRAY[]::NUMERIC[];
  v_x   NUMERIC;
BEGIN
  IF v_hex !~ '^#[0-9a-f]{6}$' THEN RETURN NULL; END IF;

  -- Los tres canales, de 0 a 1.
  v_c := ARRAY[
    ('x' || substr(v_hex, 2, 2))::BIT(8)::INTEGER / 255.0,
    ('x' || substr(v_hex, 4, 2))::BIT(8)::INTEGER / 255.0,
    ('x' || substr(v_hex, 6, 2))::BIT(8)::INTEGER / 255.0
  ];

  -- La corrección de gamma de sRGB, tal cual la define WCAG.
  FOREACH v_x IN ARRAY v_c LOOP
    v_l := v_l || CASE
      WHEN v_x <= 0.03928 THEN v_x / 12.92
      ELSE power((v_x + 0.055) / 1.055, 2.4)
    END;
  END LOOP;

  RETURN 0.2126 * v_l[1] + 0.7152 * v_l[2] + 0.0722 * v_l[3];
END;
$$;

-- ============================================
-- Permisos
-- ============================================
REVOKE ALL ON FUNCTION public.guardar_marca(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contraste_wcag(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.luminancia_relativa(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tipografias_disponibles() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.guardar_marca(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contraste_wcag(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tipografias_disponibles() TO authenticated;

-- `luminancia_relativa()` también, aunque sea el detalle interno de la otra.
--
-- Mi primera versión no la concedía, con la idea de no publicar una función que
-- nadie necesita llamar. Eso rompía `contraste_wcag()`: no es SECURITY DEFINER
-- —y no tiene por qué serlo, es una cuenta— así que corre con los permisos del
-- que llama, y ahí adentro se topá con un «permission denied» sobre esta.
--
-- Hacerla DEFINER para tapar eso habría sido elevar privilegios en una función
-- matemática, que es peor que conceder una función matemática.
GRANT EXECUTE ON FUNCTION public.luminancia_relativa(TEXT) TO authenticated;
