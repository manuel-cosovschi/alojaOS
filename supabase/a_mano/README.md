# Lo que hay que pegar a mano en Supabase

**Hoy: nada.** Esta carpeta está vacía y es la idea.

Durante un rato no lo estuvo, y vale dejar escrito por qué, porque la causa
sigue ahí.

## Qué pasaba

El conector de Supabase trata algunas sentencias como operaciones destructivas
y pide que una persona las confirme. En una sesión de Claude Code esa
confirmación no llega a ningún lado, así que la llamada se queda esperando y se
corta a los 60 segundos **sin ejecutar nada**. Lo comprobé mirando el catálogo
después de cada timeout: lo que se cortó no está. No es la base, no hay nada
esperando un lock: la sentencia nunca llega.

Pasa con `DROP`, con `UPDATE` y con `DELETE`, incluso adentro de un
`CREATE FUNCTION`. No busqué la regla exacta: no cambia qué hay que hacer, y la
alternativa —reescribir el SQL para que el detector no lo vea— sería esconderle
a la herramienta lo que la función hace. Una función que escribe tiene que
leerse como una función que escribe.

Con eso, de las migraciones 016 a 021 entró **todo lo que lee y nada de lo que
escribe**: el panel mostraba sus pantallas y ningún botón de guardar andaba.

## Cómo se resolvió, y cómo se aplica desde ahora

Por la Management API, que no pasa por el conector:

```
npm run db:migrate              # aplica las migraciones que falten
npm run db:migrate -- --ver     # dice qué haría, sin escribir
npm run verificar               # verificar-produccion.sql, y falla si falta algo
npm run huellas                 # el md5 del cuerpo de cada función
```

Necesita `SUPABASE_ACCESS_TOKEN` y `SUPABASE_PROJECT_REF` en `.env.local`. Ver
`.env.example`, que avisa que ese token es de la cuenta entera y conviene
revocarlo después de usarlo.

`migrate.ts` lleva registro en `sistema.migraciones` y corre sólo lo que falta.
Contra un proyecto que ya tenía migraciones aplicadas de antes del registro, el
primer paso es adoptarlas —anotarlas sin correrlas, porque volver a correr una
`CREATE TABLE` rompería—:

```
npx tsx scripts/migrate.ts --adoptar 015 --ver
npx tsx scripts/migrate.ts --adoptar 015
```

Eso ya se hizo en este proyecto. Queda anotado como `adoptada = true` en el
registro, porque «la apliqué yo» y «asumí que estaba» no son lo mismo.

## Si el token no está

Los mismos archivos de `supabase/migrations/` se pegan en el proyecto de
Supabase → **SQL Editor** → Run, en orden numérico. Las de la 016 en adelante
son idempotentes (`CREATE OR REPLACE`, `IF NOT EXISTS`); las anteriores no, así
que esas se pegan sólo contra un proyecto nuevo.

Y para saber si la base de producción está completa: pegar
`scripts/verificar-produccion.sql` en el mismo editor. Dice fila por fila si la
base es la que describe el repo. Tienen que dar todas `ok`.

## Lo que el verificador no mira

Que el **cuerpo** de una función sea el del repo. Cuando una migración se aplica
a medias puede quedar la versión anterior de una función: existe, está
concedida, contesta, y hace otra cosa.

Eso lo contesta comparar las huellas:

```
npm run huellas                                    > /tmp/produccion.txt
su pgtest -c './scripts/prueba-local.sh --huellas'  > /tmp/repo.txt
diff /tmp/produccion.txt /tmp/repo.txt
```

Dos columnas: `huella` es el cuerpo exacto, comentarios incluidos, y `codigo` es
el mismo md5 sin los comentarios. La que importa es `codigo`: contesta si la
base corre la lógica del repo. Hoy no difiere en ninguna de las 45 funciones.

Diez difieren en `huella` y no en `codigo`: son de migraciones viejas, aplicadas
antes de que esos archivos se editaran, así que producción tiene una redacción
anterior de un comentario. No se reaplican porque esas migraciones no son
idempotentes, y mover el reloj de vencimientos por una redacción no vale la
pena.
