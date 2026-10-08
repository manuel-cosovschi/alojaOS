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

**Qué hacer:** abrir el proyecto en Supabase → **SQL Editor**, pegar el
contenido del archivo que corresponda, y correrlo.

**Cómo saber si hacía falta y si funcionó:** correr
`scripts/verificar-produccion.sql` en el mismo SQL Editor. Dice fila por fila
si la base de producción es la que describe el repo. Antes de pegar esto, la
fila 59 dice `FALTA`. Después tiene que decir `ok`, y todas las demás también.
