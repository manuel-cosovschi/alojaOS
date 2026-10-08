# AlojaOS

**El sistema de reservas de tu complejo.**

Para complejos chicos de alojamiento por noche —cabañas, departamentos
temporarios, posadas— de entre 3 y 15 unidades, atendidos por sus dueños.

| | |
|---|---|
| **Su propia página de reservas** | Con su marca y su dominio, sin comisión por reserva. |
| **Un solo calendario de noches ocupadas** | Imposible superponer dos reservas sobre la misma unidad. Lo garantiza la base, no el código. |
| **Precios por período** | Temporada alta, media, baja, fines de semana largos. Cada noche se cobra según su propia fecha. |
| **La seña** | El huésped sube el comprobante, el dueño aprueba, se confirma. |
| **Bloqueos del dueño** | Para cuando usa una unidad él. |
| **El objetivo de la temporada** | Y cuánto lleva. |

**Para quién no es:** hoteles con recepción y decenas de habitaciones, que
necesitan un PMS de verdad; y alquileres que viven de Booking o Airbnb y no
quieren una página propia.

AlojaOS es un producto de **SOVARE**.

---

## Estado

La página de reservas anda de punta a punta: se elige unidad y noches, se ve el
precio, queda la seña pendiente, y el huésped sube el comprobante y **ve que el
sistema lo tiene**. Falta el panel del dueño, los mails y la venta del producto.

| Listo | Falta |
|---|---|
| Esquema multi-inquilino con RLS | El panel del dueño (necesita Auth) |
| La restricción que impide la doble reserva | Los mails |
| **La página pública de reservas** | La página comercial y el alta de clientes |
| **Subir el comprobante de la seña, y comprobar que llegó** | El vencimiento programado (hoy corre al leer y al escribir) |
| Cotización por noche, cruzando temporadas | Un despliegue (no hay proyecto de Vercel todavía) |
| Reglas del calendario y días de entrada | |
| 99 pruebas de la base, 110 de las reglas, 29 de navegador | |

El dueño ya puede aprobar o rechazar una seña: las funciones están y probadas
(`aprobar_sena`, `rechazar_sena`). Lo que falta es la pantalla, que necesita
sesión.

---

## De dónde sale

De un sistema de reservas que funciona desde 2026 en un complejo real de la
costa atlántica: una landing en React, dos páginas HTML con el JavaScript
adentro (el panel tiene 6.849 líneas), 38 funciones de Netlify, 34 workflows de
automatización y los datos en una planilla de Google.

Ese sistema anda y da de comer a un complejo. Lo que no hace es escalar a varios
clientes, y las razones son concretas:

- **La lógica no estaba en el repositorio.** De los ~24 endpoints de
  automatización que el sistema invocaba, 10 tenían fuente versionada. El resto
  vivía sólo dentro de la herramienta, así que un bug no se podía encontrar
  buscando en el código, y arreglarlo era editar a mano, por cliente.
- **Las direcciones de los webhooks son únicas por instancia.** "Duplicar los
  workflows y cambiar un valor" no era posible: había que renombrar ~24
  direcciones por cliente y reflejarlas en 39 variables de entorno.
- **La marca estaba en el esquema de los datos.** La tabla de precios tenía una
  columna por cabaña, con el código de cada cabaña como nombre de columna. Un
  complejo con otra cantidad de unidades no entraba sin rehacer la tabla.
- **Nada garantizaba la regla principal.** El chequeo de superposición era leer
  la planilla y después escribir. Entre leer y escribir entra otro.

Dar de alta un complejo nuevo costaba unas 20 a 28 horas de trabajo. Acá es una
fila.

Lo que sí vale de ese sistema son las reglas, que costaron una temporada de
operación real, y están portadas acá una por una, cada una con el comentario de
por qué es así. El código viejo se lee para copiar esas reglas; no es la base de
esto.

---

## Las decisiones que no se discuten

### Nunca dos reservas sobre la misma unidad y la misma noche

Lo garantiza una restricción de exclusión sobre el rango de noches:

```sql
ALTER TABLE reservas ADD CONSTRAINT reservas_sin_superponer
  EXCLUDE USING gist (unidad_id WITH =, noches WITH &&)
  WHERE (estado IN ('HOLD_TRANSFER', 'CONFIRMED', 'BLOCKED'));
```

No hay lectura previa que pueda quedar vieja, no depende de que el código se
acuerde de chequear, y vale igual para el alta pública, la carga a mano, el
bloqueo del dueño y el cambio de fechas de una reserva existente.

El rango es `[check_in, check_out)` —entrada incluida, salida excluida— porque
el día que uno se va es el día que entra el siguiente, y eso no se pisa. Con el
otro criterio el dueño perdería una noche por reserva.

`npm run db:test` lo prueba con dos escrituras simultáneas de verdad: dos
sesiones pidiendo las mismas noches al mismo tiempo. Una entra, la otra recibe
un mensaje para mostrarle a una persona.

### Las fechas son días de Argentina, no UTC

Una fecha de reserva es un día de calendario: no tiene hora y no tiene zona. El
servidor corre en UTC y entre las 21 y las 24 de Argentina ya está en el día
siguiente, así que `new Date().toISOString().slice(0, 10)` devuelve mañana.

En un sistema de reservas eso no es un detalle de presentación: una noche mal
contada es una reserva superpuesta o una seña mal calculada.

`hoyISO(zona)` en `src/lib/fechas.ts` es el único lugar que mira el reloj, y
`src/lib/__tests__/fechas.manual.mts` congela el reloj a las horas en que esto
se rompe.

### La identidad de un complejo es una fila, no un archivo

El nombre, la localidad, el teléfono, los colores, las unidades, el mes en que
arranca la temporada, el porcentaje de seña y las horas que dura el lugar
guardado: todo está en `complejos` y `unidades`. El código no tiene dónde
escribirlos.

`npm run sin-marca` falla si alguien escribe la marca de un cliente en el
código. Distingue valor de explicación: un nombre de complejo dentro de una
cadena de texto es una infracción, y en un comentario que cuenta de dónde sale
una regla, no.

### Un visitante ve lo público y nada más

El rol anónimo **no tiene SELECT sobre ninguna tabla**. Lo público se sirve por
funciones que devuelven exactamente los campos que la página necesita, así que
el día que alguien agregue una columna con algo privado, no se publica sola.

Las fechas ocupadas son públicas; quién las ocupa, no. `noches_ocupadas()`
devuelve unidad y fechas, sin nombre, teléfono ni documento.

`npm run aislamiento` le pega a la base con la clave pública —la que viaja en el
navegador de cualquiera— y comprueba que sea cierto. Conviene correrlo después
de cada migración: una policy de más, un `GRANT` que vuelve con una migración o
una tabla nueva sin RLS lo rompen solos.

### Nada contesta que está bien sin estarlo

Una auditoría del sistema anterior encontró que **todos sus errores tenían la
misma forma: devolvían éxito mientras no hacían nada.** No hubo pantallas rojas
ni funciones caídas. La planilla devolvía las filas con la plata en blanco; la
subida del comprobante contestaba "ok" sin guardar el archivo; el desbloqueo
contestaba "desbloqueado" sin desbloquear; el bot daba una lista de precios bien
formateada, de otra temporada. Dos de esos estuvieron rotos desde el primer día
y se encontraron meses después, cuando alguien fue a buscar un número concreto y
no cerraba.

Un error ruidoso se arregla el mismo día. Esos duraron meses porque para
notarlos había que ir a comparar un número contra la realidad.

Lo que se hace distinto acá:

- **La lista de señas pendientes no se arma con un filtro.** Allá el panel
  mostraba las que no habían vencido, lo cual era correcto *mientras* el
  mecanismo que las vencía funcionara — y "0 pendientes" era también lo que
  diría si ese mecanismo estuviera muerto. Acá `reservas_pendientes()` vence
  primero y devuelve después, así que lo que muestra está vivo de verdad.
- **El vencimiento no es una tarea aparte que pueda morirse sola.** Corre
  adentro de las funciones que consultan disponibilidad y crean reservas: si
  esas andan, aquello anda. `salud_vencimientos()` contesta la pregunta que allá
  no se podía contestar, y su campo `atrasadas` tiene que ser siempre 0.
- **Una operación no puede decir que hizo algo sin haberlo hecho.**
  `desbloquear()` devuelve cuántas filas cambió y distingue "listo" de "no había
  nada bloqueado ahí".

---

## La página de reservas

Cada complejo atiende en `sucomplejo.alojaos.shop`. El subdominio es lo único
que decide qué datos se leen, así que es una decisión de seguridad: el
middleware **borra** la cabecera `x-complejo` que llegue de afuera antes de
escribir la suya, y un subdominio sirve sólo su página pública — el panel, el
login y la página comercial se van al dominio principal, así que la sesión del
dueño nunca queda atada a un subdominio.

La marca del complejo llega al navegador como variables CSS que la página
escribe desde su fila de `complejos`. En el sistema anterior la paleta estaba
repetida inline en cinco archivos HTML.

El calendario muestra qué noches están tomadas, respeta que el día de salida de
una reserva sea día de entrada para la siguiente, y deshabilita los días de
entrada que el complejo no permite en ese tramo. Nada de eso es la garantía:
`crear_reserva()` vuelve a validar todo antes de escribir, y el importe que se
guarda lo calcula la base. En el sistema anterior el alta guardaba el importe
que mandaba la página, y un importe que llega del navegador es un dato del
cliente.

---

## Correrlo

```bash
npm install
npm test        # typecheck, chequeo de marca y las reglas
npm run db:test # las migraciones y la base, contra un Postgres de verdad
```

`npm run db:test` necesita Postgres 16 o superior con `btree_gist`
(`postgresql-contrib`). Levanta un cluster al momento, aplica las migraciones,
corre las pruebas y lo tira. No toca ningún Supabase.

### Tocar el producto sin tener Supabase

```bash
npm run dev:local   # Postgres + PostgREST + un complejo de ejemplo
npm run build && npm start
npm run prueba:navegador
```

`dev:local` levanta Postgres, le aplica las migraciones, carga un complejo
inventado y pone adelante **PostgREST**, que es la misma capa REST que usa
Supabase. Escribe `.env.local` apuntando ahí. Con eso el camino completo —el
navegador pide, PostgREST ejecuta, la base decide— se prueba en cualquier
máquina sin tocar la cuenta de nadie.

Lo que no cubre es Auth: el panel del dueño necesita sesiones de verdad y eso
lo da Supabase. Sirve para todo lo público, que es lo que ve el huésped.

`prueba:navegador` corre el flujo en un Chromium de verdad: que las noches
tomadas se vean tomadas, que el mínimo y el día de entrada se expliquen antes
del formulario, que una estadía que cruza de temporada se cobre a dos precios,
que una unidad sin tarifa lo diga, que reservar escriba la reserva — y que la
página no publique el nombre ni el teléfono de ningún huésped.

Esta batería existe por un motivo concreto: el sistema anterior tenía una y **se
perdió**, porque vivía fuera del repositorio.

### Contra el proyecto de Supabase

El proyecto de AlojaOS existe: `alojaos`, en `sa-east-1`, con las 12 migraciones
aplicadas menos un pedazo, que está en `supabase/a_mano/` y se pega a mano (ver
más abajo). La URL y la clave pública se sacan del dashboard (Project Settings →
API) y van a `.env.local`; no están en el repositorio, aunque la clave pública
viaje igual en el navegador.

```bash
cp .env.example .env.local   # completá URL y claves
npm run db:migrate
npm run aislamiento
```

Ojo: `npm run dev:local` **sobreescribe** `.env.local` apuntando al Postgres de
al lado. Si venías trabajando contra Supabase, guardate una copia.

### Lo que apareció al aplicarlo en Supabase de verdad

Las nueve primeras migraciones pasaban la prueba local y en Supabase dejaron tres
cosas mal. La tercera es la que importa:

| Qué | Por qué no se había visto |
|---|---|
| Dos funciones de trigger sin `search_path` fijo | Olvido; el linter de Supabase lo marca y tenía razón |
| `btree_gist` en `public`, el esquema que se expone como API | Nadie lo mira hasta que alguien lo mira |
| **`anon` podía ejecutar tres funciones que no son para él** | **El arnés local no reproducía las default privileges de Supabase sobre funciones** |

La migración 008 dice que los permisos tienen que decir lo que parecen decir, y
revocaba `EXECUTE` de `PUBLIC`. En Supabase el permiso no viene de ahí: cada
función nace con un `GRANT` **explícito** a `anon`, y revocar de `PUBLIC` no lo
toca. El arnés no tenía esa concesión, así que la prueba que existe para que los
permisos no mientan estaba corriendo contra una base donde los permisos eran
otros.

Reproducir mal el entorno es peor que no probarlo: da una respuesta
tranquilizadora y falsa. Lo arreglado: el prelude de los dos scripts locales
ahora concede lo mismo que Supabase, `prueba-base.sql` **afirma quién puede
ejecutar qué** leyéndolo de la base, y sin la migración 010 esas aserciones
fallan (comprobado).

El linter va a seguir marcando las cinco funciones que `anon` sí puede llamar.
Eso es a propósito: la página de reservas no tiene sesión. Son SECURITY DEFINER
y cada una decide adentro qué devuelve — ninguna acepta el estado ni el importe
de una reserva, ninguna devuelve datos de un huésped, y `crear_reserva` sólo
puede dejar una seña pendiente.

### Que la base de producción SEA la del repo

`prueba-base.sql` comprueba que las reglas funcionen, contra un Postgres local.
Eso no contesta la otra pregunta, que es distinta y ya falló: **¿la base de
producción es la que describen las migraciones?** Un esquema a medio aplicar
contesta bien a casi todo y mal a una cosa, y esa una cosa aparece el día que un
huésped la usa.

Para eso está `scripts/verificar-produccion.sql`. Se pega en el SQL Editor del
proyecto y contesta fila por fila. No escribe nada y no lee datos de nadie: sólo
el catálogo.

`prueba-local.sh` lo corre también contra la base local, donde tiene que dar
`ok` en todo. Eso comprueba el verificador: uno con una firma de función mal
escrita contesta `FALTA` sobre algo que está, y manda a arreglar lo que no está
roto.

En su primera corrida contra el proyecto de verdad encontró algo que diez
migraciones y 94 pruebas no habían visto: tres funciones de trigger con
`EXECUTE` concedido a `PUBLIC`, o sea ejecutables por `anon`.

No es un agujero —una función que devuelve `trigger` no se puede llamar desde
SQL, y PostgREST no publica funciones con ese tipo de retorno— pero se cerró
igual (migración 012), por un motivo que sí importa: la prueba local que mira
"quién puede ejecutar qué" lo hacía **sobre una lista de nombres escrita a
mano**, y esas tres no estaban en la lista. Una prueba así comprueba la memoria
de quien la escribió, no la base. Ahora las dos enumeran todo `public`.

### Lo que no se puede aplicar desde acá

`supabase/a_mano/01_reservas_pendientes.sql` hay que pegarlo en el SQL Editor.

El motivo no es del esquema: el conector de Supabase trata cualquier `DROP` como
destructivo y pide que una persona lo confirme, y esa confirmación no llega a
ningún lado en una sesión sin interfaz. La llamada se queda esperando y se corta
a los 60 segundos **sin hacer nada**. Lo comprobé con un `DROP FUNCTION IF
EXISTS` de una función inexistente: también se cuelga, y mientras tanto la base
no tiene nada bloqueado ni esperando un lock.

Lo que queda pendiente es una sola función, `reservas_pendientes()`, que necesita
dos columnas de salida más y por eso va con `DROP` (Postgres no deja cambiar el
tipo de retorno de una función existente). Hoy nada la llama: la usaría el panel
del dueño, que no está escrito.

Después de pegarlo, `verificar-produccion.sql` tiene que pasar la fila 59 de
`FALTA` a `ok`.

---

## Estructura

```
src/
├── app/             La página: layout, raíz y estilos
├── components/      El calendario y el flujo de reserva
├── actions/         reservar.ts: cáscara fina sobre crear_reserva()
├── middleware.ts    Qué complejo sirve cada subdominio
└── lib/
    ├── tenant.ts    Del Host al complejo. Decisión de seguridad
    ├── complejo.ts  Leer el complejo de la petición

    ├── fechas.ts    El día de Argentina, contar noches, superposición
    ├── precios.ts   Cotizar: cada noche por su fecha
    ├── calendario.ts Ventana, mínimos, días de entrada, bloques enteros
    ├── temporada.ts A qué temporada pertenece una fecha
    ├── constants.ts Valores por defecto y subdominios reservados
    └── __tests__/   Las reglas, con el reloj congelado donde hace falta

supabase/migrations/
├── 001_core.sql           complejos, unidades, miembros, RLS
├── 002_reservas.sql       reservas y la restricción de exclusión
├── 003_precios.sql        períodos y precio por unidad
├── 004_calendario.sql     ventana, bloques enteros, mínimos por tramo
├── 005_objetivos.sql      el objetivo de la temporada
├── 006_publico.sql        qué ve un visitante
├── 007_crear_reserva.sql  el único camino para ocupar una noche
├── 008_permisos.sql       que los permisos digan lo que parecen decir
├── 009_nada_falla_en_silencio.sql  pendientes, testigo de vencimiento, desbloqueo
└── 010_endurecer.sql     lo que apareció al aplicarlo en Supabase de verdad

scripts/
├── migrate.ts            Aplica las migraciones a un proyecto de Supabase
├── dev-local.sh          Postgres + PostgREST + ejemplo: el producto sin Supabase
├── ejemplo.sql           Un complejo inventado, con los casos que importan
├── prueba-local.sh       Postgres al momento: migraciones, pruebas y la carrera
├── prueba-base.sql       Las 68 pruebas de la base
├── prueba-navegador.mts  El flujo de reserva en un Chromium de verdad
├── aislamiento.ts        Qué puede leer y escribir un visitante
└── sin-marca.ts          Que ninguna marca de cliente esté en el código
```

Los comentarios del código explican **por qué**, no qué. Donde una regla sale
del sistema anterior, el comentario dice cuál era el error que evita.

---

## Lo que se decidió dejar afuera

**El bot de WhatsApp.** El sistema del que sale esto tiene uno, de 44 nodos, que
contesta disponibilidad y precios. No está acá, por decisión del dueño del
producto.

Vale anotar por qué también era un problema de producto: la API de WhatsApp pide,
por cliente, una cuenta de Meta Business, verificación del negocio y un número
de teléfono dedicado —no el celular del dueño—. Eso son días de espera de Meta,
con riesgo de rechazo, así que ningún plan que se active solo podía incluirlo.
