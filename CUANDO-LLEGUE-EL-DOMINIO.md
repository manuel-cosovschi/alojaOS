# Cuando llegue `alojaos.shop`

Dos cosas están esperando ese dominio, y las dos son cortas. Esta lista existe
para que el día que lo compres no haya que reconstruir el razonamiento.

Al final de todo, el comando que dice si quedó bien:

```
npm run prueba:despliegue       # el sitio en vivo
npm run prueba:navegador        # la página del huésped, con los mails
```

---

## 1. El comodín en Vercel — sin esto no hay clientes

**Por qué bloquea:** la página de cada complejo vive en un subdominio
(`cabanias-del-sol.alojaos.shop`). Vercel **no** da subdominios comodín en
`*.vercel.app`, así que hoy ningún complejo tiene página: `npm run alta` lo dice
en vez de imprimir un link muerto.

**Qué hacer:**

1. Vercel → proyecto `alojaos` → **Settings → Domains → Add**
   - `alojaos.shop`
   - `*.alojaos.shop` ← **el comodín es el que importa**
2. Cargar los registros DNS que Vercel te muestre, en donde compraste el
   dominio. Un comodín pide un `CNAME` de `*` apuntando a Vercel.
3. Cambiar dos variables en **Settings → Environment Variables** (las tres
   targets: production, preview, development):

   ```
   NEXT_PUBLIC_SITE_URL=https://alojaos.shop
   NEXT_PUBLIC_ROOT_DOMAIN=alojaos.shop
   ```

   Hoy valen `https://alojaos.vercel.app` y `alojaos.vercel.app`.
4. Redesplegar (cualquier push, o **Redeploy** en el último deployment).

**Cómo saber que quedó:** abrir `https://cabanias-del-sol.alojaos.shop`. Tiene
que mostrar la página del complejo de ejemplo. Si muestra la página comercial,
el comodín no está resolviendo; si no abre, el DNS todavía no propagó.

---

## 2. El remitente en Resend — sin esto no salen los mails

**Por qué bloquea:** la clave de Resend ya está cargada (en `.env.local` y en
Vercel) y **anda**: mandé un mail de prueba y el proveedor lo aceptó. Lo que
falta es un remitente de un dominio verificado.

Mientras falte, el sistema **no manda y lo deja anotado**: cada reserva queda
con un aviso en estado `SIN_CONFIGURAR` cuyo motivo dice «falta RESEND_DE», y el
panel le muestra al dueño a qué huésped tiene que escribirle él. No se pierde
nada en silencio.

**Por qué no uso el dominio de prueba de Resend mientras espero:** un mail desde
`onboarding@resend.dev` cae en spam y le muestra al huésped una dirección que no
es la del complejo. Peor que no mandarlo. Por eso el código se niega.

**Qué hacer:**

1. Resend → **Domains → Add Domain** → `alojaos.shop`
2. Cargar los registros que te da (un `TXT` de verificación, y los `CNAME` de
   DKIM) en donde compraste el dominio. Es el mismo lugar que el punto 1, así
   que conviene hacer los dos juntos.
3. Esperar a que Resend lo marque **Verified**.
4. Agregar la variable en Vercel (production, preview, development):

   ```
   RESEND_DE=AlojaOS <reservas@alojaos.shop>
   ```

   Y en `.env.local`, para que las pruebas locales la vean.
5. Redesplegar.

**Cómo saber que quedó:** `npm run prueba:navegador`. Esa batería mira si hay
clave y remitente y exige lo que corresponda: con los dos cargados, la aserción
pasa a ser «el aviso figura como ENVIADO y con el id del proveedor». Es la única
de las tres que hoy no se puede exigir, y cuando el dominio esté se exige sola,
sin tocar nada.

---

## 3. Y entonces sí, el primer cliente

Recién con el punto 1 hecho se puede dar de alta un complejo de verdad:

```
cp scripts/ejemplo-alta.json clientes/su-complejo.json
# editarlo
npm run alta -- clientes/su-complejo.json --ver    # dice qué haría
npm run alta -- clientes/su-complejo.json
```

El alta deja las reservas **apagadas** a propósito: un complejo recién creado no
tiene precios, así que prenderlo publicaría una página que se abre y no deja
reservar nada. Los precios los carga el dueño desde el panel, y el panel le
avisa si prende antes.

---

## Lo que NO está esperando el dominio

- Revocar `sb_secret_IBTER...`, la clave de servicio de Supabase que está en
  Vercel marcada TEMPORAL. Eso se puede hacer hoy: generar una nueva en
  Supabase → Settings → API, reemplazarla en Vercel y en `.env.local`, y revocar
  la vieja.
- El token personal de Supabase (`SUPABASE_ACCESS_TOKEN`), que es de la **cuenta
  entera**. Si ya no hace falta aplicar migraciones, conviene revocarlo en
  <https://supabase.com/dashboard/account/tokens>.
