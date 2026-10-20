-- ============================================
-- Las señas de la plantilla no vencen
-- ============================================
-- La 025 sembró las señas de ejemplo de la plantilla con un plazo de «ahora
-- más cuatro horas». El reloj que vence señas corre cada cinco minutos sobre
-- TODAS las reservas, la plantilla incluida, y a las cuatro horas hizo su
-- trabajo: las dos señas de ejemplo pasaron a EXPIRED. Desde ese momento cada
-- demo nueva nacía sin ninguna seña que mostrar, y la guía señalaba una lista
-- vacía. Lo encontró la batería del demo (`npm run prueba:demo`) en su segunda
-- corrida: la primera fue antes de que pasaran las cuatro horas.
--
-- El plazo de la plantilla no significa nada: cada copia calcula el suyo
-- contra el momento en que se arma (ver `crear_demo`). Así que en la
-- plantilla el plazo es infinito, y el reloj no tiene nada que vencer ahí.
--
-- Y se devuelven a HOLD_TRANSFER las que ya vencieron. Sólo las de la
-- plantilla, sólo las que vinieron de la web: es la plantilla, no hay nadie
-- del otro lado esperando nada.
UPDATE reservas r
   SET estado = 'HOLD_TRANSFER',
       vence_el = 'infinity',
       motivo_estado = NULL
  FROM complejos c
 WHERE c.id = r.complejo_id
   AND c.es_plantilla_demo
   AND r.origen = 'web'
   AND r.estado IN ('HOLD_TRANSFER', 'EXPIRED');
