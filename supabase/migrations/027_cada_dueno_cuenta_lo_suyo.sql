-- ============================================
-- Cada dueño cuenta lo suyo
-- ============================================
-- `salud_del_vencimiento()` es la que el panel usa para decir «el vencimiento
-- de las señas corre solo, cada 5 minutos. N esperando transferencia». Ese N
-- contaba las señas de TODA la plataforma. Con un solo cliente era el mismo
-- número; con la demo apareció: un visitante con dos señas en su lista leía
-- «4 esperando», porque contaba también las de la plantilla y las del demo
-- público. Y con el segundo cliente habría sido peor: cada dueño vería cuántas
-- reservas tienen los demás.
--
-- Ahora los dos números que se muestran —atrasadas y esperando— son de los
-- complejos de quien mira. Lo que sigue siendo de toda la plataforma es el
-- veredicto `esta_bien`: si el reloj se traba, se traba para todos, y un dueño
-- con cero señas también tiene que enterarse de que no corre.
--
-- Cuerpo tomado del que corre en producción; lo nuevo son los dos conteos.
CREATE OR REPLACE FUNCTION public.salud_del_vencimiento()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_atrasadas   INTEGER;
  v_esperando   INTEGER;
  v_atrasadas_todas INTEGER;
  v_job         RECORD;
  v_mecanismo   TEXT := 'al_leer';
  v_ultima      TIMESTAMPTZ;
  v_ultimo_est  TEXT;
  v_fallas      INTEGER := 0;
BEGIN
  SELECT count(*) FILTER (WHERE estado = 'HOLD_TRANSFER' AND vence_el < now()),
         count(*) FILTER (WHERE estado = 'HOLD_TRANSFER' AND vence_el >= now())
    INTO v_atrasadas, v_esperando
    FROM reservas r
   WHERE public.es_miembro(r.complejo_id);

  SELECT count(*) INTO v_atrasadas_todas
    FROM reservas
   WHERE estado = 'HOLD_TRANSFER' AND vence_el < now();

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $q$
      SELECT jobid, active FROM cron.job WHERE jobname = 'alojaos-liberar-vencidas'
    $q$ INTO v_job;

    IF v_job.jobid IS NOT NULL AND v_job.active THEN
      v_mecanismo := 'cron';
      EXECUTE format($q$
        SELECT max(end_time), count(*) FILTER (WHERE status <> 'succeeded')
          FROM cron.job_run_details
         WHERE jobid = %s AND start_time > now() - interval '1 day'
      $q$, v_job.jobid) INTO v_ultima, v_fallas;
      EXECUTE format($q$
        SELECT status FROM cron.job_run_details
         WHERE jobid = %s ORDER BY start_time DESC LIMIT 1
      $q$, v_job.jobid) INTO v_ultimo_est;
    ELSIF v_job.jobid IS NOT NULL THEN
      v_mecanismo := 'cron_apagado';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'atrasadas', v_atrasadas,
    'esperando', v_esperando,
    'mecanismo', v_mecanismo,
    'ultima_corrida', v_ultima,
    'ultimo_estado', v_ultimo_est,
    'fallas_ultimo_dia', v_fallas,
    'nunca_corrio', v_mecanismo = 'cron' AND v_ultima IS NULL,
    'esta_bien',
      v_atrasadas_todas = 0
      AND v_mecanismo = 'cron'
      AND v_fallas = 0
      AND v_ultima IS NOT NULL
      AND v_ultima > now() - interval '20 minutes'
  );
END;
$function$;
