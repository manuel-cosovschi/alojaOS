# `alojaos.shop` — estado

Comprado en GoDaddy el 14/10/2026, con el DNS manejado desde Vercel.

## Lo que está hecho

- **Nameservers** en `ns1.vercel-dns.com` / `ns2.vercel-dns.com`. El DNS se
  maneja desde Vercel, así que los registros se cargan por la API.
- **`alojaos.shop`** y **`*.alojaos.shop`** en el proyecto, las dos verificadas.
  El comodín es lo que hace que cada complejo tenga su página en
  `sucomplejo.alojaos.shop`.
- **`www.alojaos.shop`** → redirección 308 al dominio pelado, replicando el
  CNAME que había en GoDaddy.
- **`NEXT_PUBLIC_SITE_URL`** y **`NEXT_PUBLIC_ROOT_DOMAIN`** apuntando al
  dominio propio, en Vercel (production, preview, development) y en
  `.env.local`.
- **Los cuatro registros de Resend**, creados en el DNS de Vercel y resolviendo:

  | Tipo | Nombre | Para qué |
  |---|---|---|
  | `TXT` | `resend._domainkey` | DKIM: firma los mails al huésped |
  | `MX` | `send` | A dónde llegan los rebotes y las quejas |
  | `TXT` | `send` | SPF: autoriza a amazonses.com a mandar |
  | `CNAME` | `rsend` | El dominio de seguimiento |

  El dominio en Resend es `bb667265-2081-4c4d-add7-8931705b5d33`, región
  `sa-east-1` (São Paulo), que es la más cerca de los destinatarios argentinos.

## Verificado contra el dominio en vivo

```
https://alojaos.shop                     → la página comercial
https://cabanias-del-sol.alojaos.shop    → la página del complejo
https://www.alojaos.shop                 → 308 a https://alojaos.shop/
ALOJAOS_BASE=https://alojaos.shop npm run prueba:despliegue   → 12 de 12
```

Durante el redespliegue, la primera aserción de esa batería —la que comprueba
que la página abra sin estar logueado en Vercel— dio HTTP 503 dos veces
seguidas, mientras `curl` diez veces y `fetch` de Node daban 200 en el mismo
momento. Dejó de reproducirse una vez que el despliegue terminó de propagar. No
tengo la causa probada; lo que sí está comprobado es que no se reproduce más y
que la batería da 12 de 12.

## Lo que falta

- Que **Resend termine de verificar** el dominio. Los cuatro registros ya
  resuelven; falta su propio chequeo, que puede tardar un rato.
- Cargar **`RESEND_DE="AlojaOS <reservas@alojaos.shop>"`** una vez verificado.
  Hasta entonces el sistema **no manda mails y lo deja anotado**: cada reserva
  queda con un aviso en `SIN_CONFIGURAR` cuyo motivo dice que falta el
  remitente, y el panel le muestra al dueño a qué huésped escribirle.
  `npm run prueba:navegador` mira si están la clave y el remitente y exige lo
  que corresponda, así que cuando los dos estén, esa batería empieza a exigir
  `ENVIADO` sola.

## Por qué el registrador sigue en GoDaddy

**ICANN prohíbe transferir un dominio durante los primeros 60 días** desde que
se registra. Se compró el 14/10, así que esa puerta se abre a mediados de
diciembre.

Y no hace falta: los nameservers en Vercel ya dan lo que importa —que el DNS se
maneje desde ahí—, es gratis y se revierte. Transferir el registrador cobra un
año de renovación y ata 60 días más. Si en diciembre conviene unificar la
facturación, se hace entonces y no cambia nada técnico.

## El primer cliente

Con el comodín andando ya se puede:

```
cp scripts/ejemplo-alta.json clientes/su-complejo.json
# editarlo
npm run alta -- clientes/su-complejo.json --ver    # dice qué haría
npm run alta -- clientes/su-complejo.json
```

El alta deja las reservas **apagadas** a propósito: un complejo recién creado no
tiene precios, así que prenderlo publicaría una página que se abre y no deja
reservar nada. Los precios los carga el dueño desde el panel.

## Lo que no depende del dominio y sigue pendiente

- Revocar `sb_secret_IBTER...`, la clave de servicio de Supabase que está en
  Vercel marcada TEMPORAL. Generar una nueva en Supabase → Settings → API,
  reemplazarla en Vercel y en `.env.local`, y revocar la vieja.
- El token personal de Supabase (`SUPABASE_ACCESS_TOKEN`), que es de la **cuenta
  entera**: conviene revocarlo en
  <https://supabase.com/dashboard/account/tokens> cuando no haya que aplicar
  más migraciones.
