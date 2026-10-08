-- ============================================
-- Que el vencimiento corra solo
-- ============================================
-- Hasta acá `liberar_vencidas()` se llamaba al leer y al escribir: `crear_reserva`,
-- `estado_reserva`, `reservas_pendientes`, `registrar_comprobante`. Eso cubre el
-- caso que importa —nadie puede tomar unas noches que un hold vencido todavía
-- figura ocupando, porque antes de mirar se vence— y por eso se hizo así primero.
--
-- Lo que NO cubre: si nadie entra a la página, el hold no vence. Las noches
-- quedan tomadas hasta que alguien pase. Un complejo chico en temporada baja
-- pasa días sin una visita, y el dueño ve su mejor cabaña bloqueada por una
-- transferencia que nunca llegó.
--
-- Y es el peor tipo de falla para este producto: no hay error, no hay log, la
-- función existe y sus pruebas pasan. El mecanismo está muerto sólo cuando nadie
-- mira, que es exactamente cuando hace falta.
--
-- ------------------------------------------------------------------
-- Por qué pg_cron y no un cron de Vercel
-- ------------------------------------------------------------------
-- Un cron de Vercel pegándole a una ruta sería más fácil de leer en el repo. Y
-- tendría tres formas de morir sin avisar que pg_cron no tiene: un deploy que
-- cambia la ruta, un secreto que rota, y el plan de Vercel que limita cuántas
-- veces por día. Si el reloj vive en la base, no depende de que el sitio esté
-- arriba ni de que el deploy haya salido bien.
--
-- ------------------------------------------------------------------
-- Lo que esto NO resuelve, y cómo se ve
-- ------------------------------------------------------------------
-- Un job de pg_cron también se muere en silencio: corre, falla, y nadie entra a
-- `cron.job_run_details`. Así que la migración hace dos cosas, y la segunda es
-- la que importa:
--
--   1. programa el job, donde pg_cron esté disponible;
--   2. agrega `salud_del_vencimiento()`, que dice **qué mecanismo está vivo de
--      verdad** y cuándo corrió por última vez.
--
-- Esa función es la que contesta la pregunta real. Que exista un job no
-- significa que corra; que la función exista no significa que alguien la llame.
-- Lo único que no miente es `atrasadas`: holds que ya tendrían que estar
-- vencidos y siguen ocupando noches. Si eso no es 0, el mecanismo está muerto,
-- sea cual sea.
--
-- ------------------------------------------------------------------
-- Dos entornos, y el que no tiene pg_cron lo dice
-- ------------------------------------------------------------------
-- El Postgres del arnés no tiene pg_cron: hay que compilarlo aparte y no está
-- en contrib. Así que esta migración es condicional, y eso de por sí es un
-- riesgo —una migración condicional es una que hace distinto en cada lado—.
--
-- Lo que lo hace aceptable es que la diferencia queda **nombrada**:
-- `salud_del_vencimiento()` devuelve `mecanismo`, que dice 'cron' o 'al_leer'.
-- Local contesta 'al_leer' y es verdad. Producción tiene que contestar 'cron', y
-- eso lo exige `scripts/verificar-produccion.sql`. La diferencia no se supone:
-- se lee de la base y se verifica donde corresponde.

-- ------------------------------------------------------------------
-- El job
-- ------------------------------------------------------------------
DO $programar$
DECLARE
  v_hay_cron BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
    INTO v_hay_cron;

  IF NOT v_hay_cron THEN
    RAISE NOTICE 'pg_cron no está disponible acá: el vencimiento va a seguir corriendo al leer y al escribir. salud_del_vencimiento() lo va a decir.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- `cron.schedule` con el mismo nombre reemplaza el job, así que esto se puede
  -- volver a correr. Cada 5 minutos: el plazo de una seña se mide en horas, así
  -- que 5 minutos de retraso no le cambia nada a nadie, y es poco trabajo.
  PERFORM cron.schedule(
    'alojaos-liberar-vencidas',
    '*/5 * * * *',
    $cmd$SELECT public.liberar_vencidas();$cmd$
  );
END
$programar$;

-- ------------------------------------------------------------------
-- Qué mecanismo está vivo
-- ------------------------------------------------------------------
-- Global y no por complejo: la pregunta es del sistema, no de un cliente. La
-- llama el panel y la llama el verificador.
--
-- `atrasadas` acá cuenta TODOS los complejos, a propósito: si el reloj se
-- muere, se muere para todos, y un número por complejo escondería que el
-- problema es del sistema.
CREATE OR REPLACE FUNCTION public.salud_del_vencimiento()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atrasadas   INTEGER;
  v_esperando   INTEGER;
  v_job         RECORD;
  v_mecanismo   TEXT := 'al_leer';
  v_ultima      TIMESTAMPTZ;
  v_ultimo_est  TEXT;
  v_fallas      INTEGER := 0;
BEGIN
  -- Lo que no miente. Si esto no es 0, da igual lo que diga el resto.
  SELECT count(*) FILTER (WHERE estado = 'HOLD_TRANSFER' AND vence_el < now()),
         count(*) FILTER (WHERE estado = 'HOLD_TRANSFER' AND vence_el >= now())
    INTO v_atrasadas, v_esperando
    FROM reservas;

  -- Y el mecanismo, leído del catálogo y no de lo que uno cree que programó.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- `cron` existe, así que se puede preguntar. Se usa SQL dinámico porque
    -- esta función se crea igual donde pg_cron NO está, y ahí `cron.job` no
    -- existe: una referencia directa no compilaría.
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
      -- Está programado y apagado. Eso no es 'cron': es peor que no tenerlo,
      -- porque alguien lo dio por hecho.
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
    -- Programado pero sin ninguna corrida registrada. Es el estado normal los
    -- primeros 5 minutos después de programarlo, y es el estado de un job
    -- muerto desde el primer día. Se distinguen por el tiempo, no por el dato,
    -- así que el dato se publica y que lo lea quien mire.
    'nunca_corrio', v_mecanismo = 'cron' AND v_ultima IS NULL,
    -- Para que el panel no tenga que saber interpretar lo de arriba.
    --
    -- Pide una corrida reciente y no sólo que el job exista: un job programado
    -- que nunca corrió, o que corrió hace seis horas, no está haciendo nada, y
    -- decir que «está bien» porque la fila está en `cron.job` es exactamente la
    -- clase de respuesta tranquilizadora que este proyecto no da. 20 minutos
    -- para un job de cada 5 es holgado: aguanta tres corridas perdidas antes de
    -- ponerse en rojo.
    'esta_bien',
      v_atrasadas = 0
      AND v_mecanismo = 'cron'
      AND v_fallas = 0
      AND v_ultima IS NOT NULL
      AND v_ultima > now() - interval '20 minutes'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.salud_del_vencimiento() FROM PUBLIC, anon;
-- La ve cualquier dueño logueado: no dice nada de ningún complejo en
-- particular, son números del sistema. Y que un dueño pueda ver que el reloj
-- está muerto es mejor que que no pueda.
GRANT  EXECUTE ON FUNCTION public.salud_del_vencimiento() TO authenticated;
