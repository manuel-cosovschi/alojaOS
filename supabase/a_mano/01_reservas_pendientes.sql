-- ============================================
-- reservas_pendientes(), con el comprobante
-- ============================================
-- Esto es la parte de `supabase/migrations/011_comprobantes.sql` que no se pudo
-- aplicar desde acá. Ver `supabase/a_mano/README.md` para el motivo.
--
-- Qué cambia: `reservas_pendientes()` le agrega dos columnas de salida,
-- `comprobante_path` y `comprobante_subido_el`. El panel del dueño las necesita
-- para saber a quién le falta el comprobante, que es lo primero que va a mirar.
--
-- Por qué va con DROP y no con CREATE OR REPLACE: le estamos agregando columnas
-- de salida, y Postgres no deja cambiar el tipo de retorno de una función que ya
-- existe. Contesta «cannot change return type of existing function».
--
-- Es seguro: hoy nada llama a esta función. El panel del dueño todavía no está
-- escrito, y es el único que la usaría. La que sí está en uso por la página de
-- reservas es `crear_reserva()`, y esto no la toca.
--
-- Después de correrlo, correr `scripts/verificar-produccion.sql`: la fila 59
-- tiene que pasar de FALTA a ok.

DROP FUNCTION IF EXISTS public.reservas_pendientes(UUID);

CREATE FUNCTION public.reservas_pendientes(p_complejo UUID)
RETURNS TABLE (
  id               UUID,
  unidad_id        UUID,
  unidad_codigo    TEXT,
  check_in         DATE,
  check_out        DATE,
  huesped_nombre   TEXT,
  huesped_telefono TEXT,
  huesped_email    TEXT,
  personas         SMALLINT,
  importe          NUMERIC,
  vence_el         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  comprobante_path TEXT,
  comprobante_subido_el TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_miembro(p_complejo) THEN
    RAISE EXCEPTION 'No tenés acceso a ese complejo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Vence primero y lee después. Nunca filtra las atrasadas de la lectura: eso
  -- dejaría el vencimiento muerto y la lista se vería igual de bien.
  PERFORM public.liberar_vencidas();

  RETURN QUERY
    SELECT r.id, r.unidad_id, u.codigo, r.check_in, r.check_out,
           r.huesped_nombre, r.huesped_telefono, r.huesped_email,
           r.personas, r.importe, r.vence_el, r.created_at,
           r.comprobante_path, r.comprobante_subido_el
      FROM reservas r
      JOIN unidades u ON u.id = r.unidad_id
     WHERE r.complejo_id = p_complejo
       AND r.estado = 'HOLD_TRANSFER'
     ORDER BY r.vence_el;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reservas_pendientes(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reservas_pendientes(UUID) TO authenticated;
