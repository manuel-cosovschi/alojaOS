# Lo que hay que pegar a mano en Supabase

Todas las migraciones de `supabase/migrations/` se aplican solas. Las de esta
carpeta no, y el motivo es una limitación de la herramienta con la que me
conecto al proyecto, no del esquema.

**Qué pasa:** el conector de Supabase trata algunas sentencias como operaciones
destructivas y pide que una persona las confirme. En esta sesión esa
confirmación no llega a ningún lado, así que la llamada se queda esperando y se
corta a los 60 segundos **sin ejecutar nada**. Lo comprobé las dos veces
mirando el catálogo después del timeout: lo que se cortó no está. No es la base:
no hay nada bloqueado ni esperando un lock.

Hasta ahora sabía que pasaba con `DROP`. Al aplicar la 016 descubrí que también
pasa con `UPDATE` adentro de un `CREATE FUNCTION`, y con un `DELETE` según cómo
esté escrito. No busqué la regla exacta: no cambia qué hay que hacer, y la
alternativa —reescribir el SQL para que el detector no lo vea— sería esconderle
a la herramienta lo que la función hace.

**Qué hay acá hoy:**

- `02_las_escrituras_del_panel.sql` **bloquea**. Mientras no se corra, el panel
  muestra todo y no guarda nada: entraron las tres funciones que leen y ninguna
  de las siete que escriben. Es pegar las migraciones 016 y 017 en el SQL
  Editor, en ese orden; las dos son idempotentes.
- `01_sacar_la_funcion_vieja.sql` es limpieza y no bloquea nada: borra una
  función que quedó corrida a un costado y que no puede llamar nadie.

**El camino que evita todo esto:** `npm run db:migrate` aplica las migraciones
por la Management API, sin pasar por el conector. Necesita
`SUPABASE_ACCESS_TOKEN` (un token personal de
<https://supabase.com/dashboard/account/tokens>) y `SUPABASE_PROJECT_REF` en
`.env.local`. Con eso, cada migración futura es un comando.

**Qué hacer, si algún día querés:** abrir el proyecto en Supabase → **SQL
Editor**, pegar el contenido, y correrlo. O correrlo con el CLI de Supabase, que
tiene la contraseña de la base y no pasa por el conector.

**Cómo saber si la base de producción está completa:** correr
`scripts/verificar-produccion.sql` en el mismo SQL Editor. Dice fila por fila si
la base es la que describe el repo. Tienen que dar todas `ok`.
