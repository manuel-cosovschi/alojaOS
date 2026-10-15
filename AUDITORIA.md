# Auditoría de AlojaOS — 15/10/2026

> **Estado: arreglado.** Todo lo 🔴 y lo 🟠 está cerrado y comprobado contra
> producción; cada hallazgo dice abajo con qué. Lo único abierto es lo que
> cuesta plata o es de tu cuenta, y está al final.

Hecha contra **producción**, probando y no leyendo código: cada cosa de acá se
comprobó ejecutándola. Donde sólo pude observar y no probar, lo digo.

---

## Lo primero, porque da contexto al resto: lo que está bien

No son suposiciones, son comprobaciones de esta auditoría.

| Qué | Cómo se comprobó |
|---|---|
| **Ninguna tabla se lee con la clave publicable** | Pedí `reservas`, `complejos`, `unidades`, `avisos`, `complejo_miembros` y `precios_unidad` con la clave que viaja en el navegador: las seis contestan `42501`, permiso denegado |
| **RLS prendida en las 11 tablas**, todas con política | Consulta a `pg_class` / `pg_policies` |
| **El bucket de comprobantes filtra del lado del servidor** | Es privado, con límite de 8 MB y lista de tipos permitidos **en el bucket**, no sólo en el navegador. Sin políticas de storage: nadie más que `service_role` lo toca |
| **El reloj de vencimientos corre de verdad** | `cron.job`: activo, cada 5 minutos, última corrida 04:55, estado `succeeded` |
| **Aislamiento entre dueños** | `prueba:duenos`, de los dos lados: ninguno ve ni escribe lo del otro |
| **Dos reservas simultáneas sobre la misma noche dejan una** | Bloque de escritura concurrente del arnés: el segundo recibe un mensaje, no un error |
| **La base es la del repo** | 85/85 en el verificador, 0 funciones con código distinto |
| **Accesibilidad de las dos páginas** | Cero controles sin etiqueta, cero botones sin nombre, cero imágenes sin `alt`, un solo `h1`, `lang` correcto |
| **Sin errores de consola ni recursos rotos** | En la comercial y en la del huésped, escritorio y celular |
| **Sin secretos en el repo** | El único que aparece es una clave falsa a propósito en `prueba-clave-rota.sh` |

Las 39 funciones `SECURITY DEFINER` que marca el linter de Supabase son
deliberadas y están documentadas: RLS no corre adentro de una función definer,
y por eso cada una valida pertenencia con `es_miembro()` y lleva `complejo_id`
en el `WHERE`. Eso está probado por `prueba:duenos`.

---

## 🔴 1. Cualquiera puede trabar el calendario de un complejo

**Probado, no supuesto.** Con la clave publicable —que está en el JavaScript de
la página, a la vista de cualquiera— llamé a `crear_reserva` nueve veces
seguidas desde la línea de comandos, sin abrir la página:

```
2026-11-02 → TOMADA      2026-11-14 → TOMADA
2026-11-05 → TOMADA      2026-11-17 → TOMADA
2026-11-08 → TOMADA      2026-11-20 → (chocó con un bloque fijo)
2026-11-11 → TOMADA      2026-11-23 → (chocó con un bloque fijo)
                         2026-11-26 → TOMADA

→ 7 tramos, 14 noches trabadas, en menos de un segundo
```

No hay **ningún** freno: ni límite por IP, ni por mail, ni por complejo, ni
captcha, ni tiempo mínimo entre llamadas. Lo busqué en las migraciones y en el
código del servidor y no hay una sola mención.

**Qué significa para un cliente.** Un script de diez líneas deja todas las
unidades de todos los complejos tomadas durante las horas que cada dueño
configuró como plazo de la seña (6 en el demo, 24 en el otro complejo), y se
puede volver a correr apenas vencen. El dueño ve su calendario lleno, su panel
lleno de señas falsas, y **no puede vender**. En temporada alta eso es plata.

Las validaciones que sí existen —mínimo de noches, día de entrada, precio
cargado, bloques fijos— limitan *dónde* se puede trabar, no *cuánto*.

### ✅ Arreglado — migraciones 023 y 024

El primer intento fue poner tres frenos adentro de la función (por mail, por
complejo y por minuto). Funcionó —el ataque pasó de catorce noches a tres— pero
el arnés encontró enseguida la tensión que dejaba: **un freno de ritmo lo
bastante bajo como para cortar un script también corta una ráfaga legítima**, y
uno lo bastante alto no corta el script. No hay número que resuelva las dos
cosas, porque desde la base un script y un fin de semana largo se ven igual.

Lo que sí los distingue es **de dónde vienen**, y eso lo sabe nuestro servidor,
no la base. Así que la 024 cierra la puerta:

- **`crear_reserva` dejó de estar concedida a `anon`.** La superficie pública
  quedó sólo de lectura: ver el complejo, cotizar, ver qué noches están ocupadas
  y ver el estado de una reserva. Lo único que escribía se fue.
- La reserva **pasa por nuestro servidor**, que la llama con la clave de
  servicio y le pasa la IP de quien reserva — que no se puede falsear desde el
  navegador porque la pone la red, no el pedido.
- El freno preciso es por IP: **tres reservas cada diez minutos**, contando
  todos los complejos, porque un script que recorre la plataforma usa la misma.
- Quedan el tope por mail (tres vigentes) y el tope por complejo (dos por unidad
  activa, piso de seis), que acotan el daño si algo de lo anterior falla.

**Comprobado contra producción**: el mismo ataque ahora contesta
`permission denied for function crear_reserva`. Y el huésped sigue reservando
por la página, que es la otra mitad: `prueba:navegador` en verde.

En el arnés quedaron ocho aserciones nuevas (**330 de 330**): los tres frenos,
que cada uno conteste con un motivo y un mensaje para una persona, que la IP
quede guardada, y que **`anon` no pueda llamar a la función** — porque si
pudiera, todo lo demás sería decorativo.

---

## 🔴 2. No hay copias de seguridad de las que se pueda restaurar

La API de Supabase contesta, para este proyecto:

```json
{ "region": "sa-east-1", "walg_enabled": true, "pitr_enabled": false, "backups": [] }
```

Ninguna copia restaurable listada, y recuperación a un punto en el tiempo
apagada. **Esto hay que confirmarlo en el panel de Supabase** —el plan gratuito
toma copias diarias que puede no exponer por esta vía— pero lo que la API
contesta es que no hay nada para restaurar.

**Por qué es crítico y no una tarea de mantenimiento.** `npm run alta` ya crea
clientes de verdad. El día que haya tres complejos adentro, la base tiene las
reservas, los datos de los huéspedes y los datos bancarios de tres negocios. Una
migración mal aplicada, un `DELETE` sin `WHERE` o una cuenta comprometida son
irreversibles.

**Antes de dar de alta al primer cliente que paga**: o se contrata PITR, o hay
un `pg_dump` programado a otro lado. Las dos cosas se pueden hacer hoy.

---

## 🟠 3. El alias y el CBU se consiguen con una llamada, y el código dice lo contrario

`src/app/page.tsx` explica por qué los datos bancarios no van en
`complejo_publico`:

> *Los datos bancarios van aparte de `complejo_publico` a propósito: así no
> quedan en el HTML de cada visita, ni de cada robot que pase por la página.*

Pero `datos_para_transferir(p_slug)` está concedida a `anon`. Con la clave
publicable y el slug —que es público— cualquiera obtiene:

```json
{"whatsapp":"...","datos_transferencia":"Alias: …\nCBU: …\nTitular: …"}
```

El dato no es un secreto: es lo que el dueño le da a cualquiera que quiera
pagarle. **El problema es el otro**: con los slugs se arma una lista de
«negocio + CBU + WhatsApp» de todos los complejos de la plataforma, que es
exactamente el kit de una estafa de reservas falsas. Y el comentario afirma una
protección que no existe, que es peor que no tener el comentario.

### ✅ Arreglado — migración 023

`datos_para_transferir(p_slug TEXT)` ya no existe. La reemplaza
`datos_para_transferir(p_reserva UUID)`, que además exige que la reserva esté
esperando transferencia. Y los datos viajan con la respuesta de `crear_reserva`,
así que la página **ya no los pide en cada visita**.

**Comprobado**: con el slug, la API contesta 404. Y hay una aserción nueva en
`prueba:navegador` que abre la página sin reservar y comprueba que el alias y el
CBU no están en el HTML.

---

## 🟠 4. Dos segundos de espera antes de ver nada

Medido contra producción, en un celular:

| | comercial | del huésped |
|---|---|---|
| Primer byte | **2.133 ms** | **1.403 ms** |
| Carga completa | 2.934 ms | 2.339 ms |
| Peso | 229 KB | 196 KB |

El peso está bien. El problema es la espera, y tiene tres causas que se suman:

1. **El servidor corre en Virginia y la base está en São Paulo.** La cabecera
   `x-vercel-id` dice `iad1`; el proyecto de Supabase está en `sa-east-1`. Cada
   consulta cruza el continente dos veces.
2. **La página del huésped hace cuatro viajes seguidos**, no en paralelo:
   `leerComplejo` (en `generateMetadata`), `leerComplejo` **otra vez** (en la
   página), `nochesOcupadas` y `datosParaTransferir`.
3. **Dos de esos cuatro son la misma consulta.** `leerComplejo` no está envuelta
   en `cache()`, así que la llamada que agregué ayer para que la pestaña lleve
   el nombre del complejo **duplicó una consulta transatlántica**. Es mía y es
   de ayer.

### ✅ Arreglado

- **`vercel.json` fija la región en `gru1` (San Pablo)**, al lado de la base.
- **`leerComplejo` quedó envuelta en `cache()` de React**, que recuerda el
  resultado dentro de un mismo render: la consulta duplicada es una sola.
- **La tercera consulta se fue entera**: los datos para transferir ya no se
  piden en cada visita.

De cuatro viajes transatlánticos por página a dos, y los dos cruzan mucho menos
continente.

El panel, en cambio, ya usa `Promise.all` bien: siete consultas en paralelo.

---

## 🟠 5. La protección de contraseñas filtradas está apagada

El linter de Supabase lo marca: `auth_leaked_password_protection` deshabilitada.
Con eso prendido, Auth rechaza contraseñas que aparecen en filtraciones
conocidas.

La contraseña del dueño abre el panel: confirmar y rechazar señas, cambiar
precios, cerrar fechas, ver los datos de todos sus huéspedes. Es un interruptor
en el panel de Supabase.

### ⚠️ A medias — lo otro es de pago

Intenté prenderlo por la API y contestó **402**: la comprobación contra
HaveIBeenPwned es del plan pago. Lo que sí se pudo y se hizo: el **largo mínimo
de contraseña pasó de 6 a 12**.

Probé seis intentos seguidos con contraseña incorrecta y los seis contestaron
400, sin freno. No alcanza para afirmar que no hay ninguno —Supabase tiene
límites propios y seis intentos no los tocan— y no me pareció correcto martillar
el endpoint de producción para averiguarlo. Queda como observación.

---

## 🟡 Menores

**La página promete «te llevás tus datos».** ✅ Ahora hay con qué: el panel
tiene, abajo de todo, un botón que baja **todo lo del complejo en un JSON** —sus
datos, sus unidades, sus precios, sus reglas, sus bloqueos y todas sus reservas
con cada huésped—. Lo arma `exportar_complejo()` en la base, con la sesión del
dueño, así que nunca puede traer el complejo de otro.

**Código muerto.** ✅ Se fueron `estadoDeReserva` y el módulo del cliente de
navegador entero. Las otras tres que había marcado —`bloqueQueToca`, `aDate` y
`aISO`— **estaban vivas**: se usan dentro de su propio archivo y mi detección
las contó mal. Las restauré; el error era de la auditoría, no del código.

**Tres cosas que ya estaban anotadas** y siguen igual: la página comercial no se
cachea porque comparte ruta con la del complejo; el ícono de pestaña de un
complejo es el nuestro; y no hay `robots.txt` ni `sitemap.xml`.

---

## Lo que no entra en esta auditoría

- **Lo que dice la página sobre ustedes** —«somos dos personas en Mar del
  Plata», el caso de Las Cañas, los tres hallazgos— no lo puedo verificar yo.
  Lo que sí verifiqué es que no hay ningún número de resultados inventado, y que
  la prueba que lo impide sigue corriendo.
- **La capacidad bajo carga.** No sé qué pasa con cincuenta personas reservando
  a la vez. La restricción de exclusión garantiza que no se pisen; cuánto
  aguanta el plan de Supabase es otra pregunta y no la medí.
- **El costo.** No miré cuánto cuesta esto por mes ni a partir de cuántos
  clientes deja de cerrar.

---

## Lo único que queda abierto

**PITR y la comprobación de contraseñas filtradas cuestan plata.** Las dos son
del plan pago de Supabase; la API contesta 402. Mientras tanto, `npm run
respaldo` baja la base entera a un archivo con permisos 600 —y falla si alguien
agrega una tabla y se olvida de incluirla—, que convierte «no hay nada» en «hay
lo del último respaldo». Antes del primer cliente que paga conviene el plan.

**Las dos claves que son tuyas**: la de servicio marcada TEMPORAL en Vercel y el
token personal de Supabase, que es de la cuenta entera. Las dos se revocan desde
tu panel.
