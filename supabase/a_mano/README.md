# Lo que hay que pegar a mano en Supabase

Todas las migraciones de `supabase/migrations/` se aplican solas. Las de esta
carpeta no, y el motivo es una limitación de la herramienta con la que me
conecto al proyecto, no del esquema.

**Qué pasa:** el conector de Supabase trata cualquier `DROP` como una operación
destructiva y pide que una persona la confirme. En esta sesión esa confirmación
no llega a ningún lado, así que la llamada se queda esperando y se corta a los
60 segundos sin hacer nada. Lo comprobé con un `DROP FUNCTION IF EXISTS` de una
función que no existe: también se cuelga. No es la base: no hay nada bloqueado
ni esperando un lock, el `DROP` nunca llega.

**Qué hay acá hoy:** nada que bloquee. Lo único es
`01_sacar_la_funcion_vieja.sql`, que es limpieza: borra una función que quedó
corrida a un costado y que no puede llamar nadie. El sistema anda igual sin
correrlo, y `verificar-produccion.sql` da todo `ok` con o sin él.

**Qué hacer, si algún día querés:** abrir el proyecto en Supabase → **SQL
Editor**, pegar el contenido, y correrlo. O correrlo con el CLI de Supabase, que
tiene la contraseña de la base y no pasa por el conector.

**Cómo saber si la base de producción está completa:** correr
`scripts/verificar-produccion.sql` en el mismo SQL Editor. Dice fila por fila si
la base es la que describe el repo. Tienen que dar todas `ok`.
