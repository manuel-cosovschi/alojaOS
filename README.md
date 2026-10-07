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

Está construida la base: el esquema, las reglas del negocio y las pruebas que
las verifican. Todavía **no hay aplicación**: ni página de reservas, ni panel,
ni página comercial, ni alta de clientes.

| Listo | Falta |
|---|---|
| Esquema multi-inquilino con RLS | La página pública de reservas |
| La restricción que impide la doble reserva | El panel del dueño |
| Cotización por noche | Los comprobantes de seña y su aprobación |
| Reglas del calendario | Los mails |
| Temporadas configurables | La página comercial y el alta |
| 44 pruebas de la base + 87 de las reglas | El vencimiento programado de las señas |

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

Contra un proyecto de Supabase:

```bash
cp .env.example .env.local   # completá URL y claves
npm run db:migrate
npm run aislamiento
```

---

## Estructura

```
src/lib/
├── fechas.ts        El día de Argentina, contar noches, superposición
├── precios.ts       Cotizar: cada noche por su fecha
├── calendario.ts    Ventana, mínimos, días de entrada, bloques enteros
├── temporada.ts     A qué temporada pertenece una fecha
├── constants.ts     Valores por defecto y subdominios reservados
└── __tests__/       Las reglas, con el reloj congelado donde hace falta

supabase/migrations/
├── 001_core.sql           complejos, unidades, miembros, RLS
├── 002_reservas.sql       reservas y la restricción de exclusión
├── 003_precios.sql        períodos y precio por unidad
├── 004_calendario.sql     ventana, bloques enteros, mínimos por tramo
├── 005_objetivos.sql      el objetivo de la temporada
├── 006_publico.sql        qué ve un visitante
├── 007_crear_reserva.sql  el único camino para ocupar una noche
└── 008_permisos.sql       que los permisos digan lo que parecen decir

scripts/
├── migrate.ts        Aplica las migraciones a un proyecto de Supabase
├── prueba-local.sh   Postgres al momento: migraciones, pruebas y la carrera
├── prueba-base.sql   Las 44 pruebas de la base
├── aislamiento.ts    Qué puede leer y escribir un visitante
└── sin-marca.ts      Que ninguna marca de cliente esté en el código
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
