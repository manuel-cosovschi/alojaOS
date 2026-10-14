# `alojaos.shop` — poner el dominio en marcha

Comprado en GoDaddy el 14/10/2026. Estado al día de hoy y qué falta.

---

## Estado del DNS, 14/10 a las 15:00

`alojaos.shop` todavía **no resuelve**: dos resolvers independientes (Google y
Cloudflare) devuelven NXDOMAIN, o sea que el registro de `.shop` todavía no
publicó el dominio. Un dominio recién comprado tarda de minutos a unas horas en
aparecer en la zona del TLD.

Mientras no aparezca ahí, no se puede distinguir si el cambio de nameservers ya
se hizo o no: el registro no tiene ningún dato del dominio todavía.

---

## ⚠️ Lo único que falta, y lo tenés que hacer vos

**Cambiar los nameservers en GoDaddy.** Es lo único a lo que yo no tengo acceso.

GoDaddy → **Mis productos → alojaos.shop → DNS → Servidores de nombres →
Cambiar → Usar mis propios servidores de nombres**, y poner estos dos:

```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Sacá los dos de GoDaddy (`ns47.domaincontrol.com` y `ns48.domaincontrol.com`).

**Qué pasa cuando lo hagas:** el DNS del dominio pasa a manejarse desde Vercel,
y de ahí en adelante los registros los puedo cargar yo —incluidos los de Resend,
cuando llegue el momento— sin que tengas que copiar y pegar nada.

**Cuánto tarda:** entre unos minutos y 48 horas. Normalmente menos de una hora.

**Los registros que tenías en GoDaddy se pierden**, y están todos bien perdidos:

| Registro | Qué era | Qué pasa |
|---|---|---|
| `A @ → Parked` | La página de estacionamiento de GoDaddy | No hace falta: lo sirve Vercel |
| `CNAME www → alojaos.shop` | | **Ya lo recreé** en Vercel, como redirección 308 al dominio pelado |
| `CNAME _domainconnect` | Interno de GoDaddy | Deja de aplicar |
| `TXT _dmarc` | El DMARC por defecto de GoDaddy, que reporta a una casilla de ellos | Vamos a poner el nuestro cuando configuremos Resend |

---

## Lo que ya está hecho

- `alojaos.shop` agregado a Vercel, con zona DNS propia (`zone: true`).
- `alojaos.shop` y **`*.alojaos.shop`** en el proyecto `alojaos`, las dos
  verificadas. El comodín es el que hace que cada complejo tenga su página en
  `sucomplejo.alojaos.shop`.
- `www.alojaos.shop` → redirección 308 a `alojaos.shop`.
- La clave de Resend cargada y probada (mandé un mail y el proveedor lo aceptó).

## Lo que hago yo apenas propague

En este orden, y **no antes**, porque hacerlo antes rompe lo que hoy funciona:

1. **Comprobar que resuelve.** `alojaos.shop` tiene que servir la página
   comercial y `cabanias-del-sol.alojaos.shop` la del complejo de ejemplo.
2. **Recién ahí**, cambiar las dos variables en Vercel:
   ```
   NEXT_PUBLIC_SITE_URL=https://alojaos.shop
   NEXT_PUBLIC_ROOT_DOMAIN=alojaos.shop
   ```
   Hoy valen `https://alojaos.vercel.app` y `alojaos.vercel.app`. Si las cambio
   antes de que el DNS resuelva, los links que arma el sistema —el del panel a
   la página del complejo, el que el dueño le manda al huésped— apuntan a un
   dominio que todavía no existe.
3. **Redesplegar** y correr `npm run prueba:despliegue` contra el dominio nuevo.
4. **Cargar los registros de Resend** en el DNS de Vercel. El dominio ya está
   agregado en Resend (`bb667265-2081-4c4d-add7-8931705b5d33`, región
   `sa-east-1`, que es la más cerca de los destinatarios argentinos) y espera
   estos cuatro:

   | Tipo | Nombre | Valor |
   |---|---|---|
   | `TXT` | `resend._domainkey` | la clave DKIM (larga; se trae de la API de Resend) |
   | `MX` | `send` | `feedback-smtp.sa-east-1.amazonses.com`, prioridad 10 |
   | `TXT` | `send` | `v=spf1 include:amazonses.com ~all` |
   | `CNAME` | `rsend` | `send.forge.rmta.net` |

   Los creo yo por la API de Vercel apenas el DNS esté ahí. Después `RESEND_DE`
   y los mails salen.
5. **Y entonces sí, el primer cliente:**
   ```
   cp scripts/ejemplo-alta.json clientes/su-complejo.json
   npm run alta -- clientes/su-complejo.json --ver
   npm run alta -- clientes/su-complejo.json
   ```

---

## Por qué NO transferí el registrador a Vercel

Porque no se puede todavía: **ICANN prohíbe transferir un dominio durante los
primeros 60 días** desde que se registra. Lo compraste hoy, así que esa puerta
se abre a mediados de diciembre.

Y no hace falta para nada de lo de arriba. Cambiar los nameservers ya te da lo
que querías —que Vercel maneje el DNS— es gratis, tarda minutos y se revierte
poniendo los de GoDaddy de vuelta. Transferir el registrador es otra cosa: te
cobra un año de renovación y te ata 60 días más.

Si en diciembre querés unificar la facturación en Vercel, se hace entonces y no
cambia nada de lo técnico.

---

## Lo que no depende del dominio y sigue pendiente

- Revocar `sb_secret_IBTER...`, la clave de servicio de Supabase que está en
  Vercel marcada TEMPORAL. Generar una nueva en Supabase → Settings → API,
  reemplazarla en Vercel y en `.env.local`, y revocar la vieja.
- El token personal de Supabase (`SUPABASE_ACCESS_TOKEN`), que es de la **cuenta
  entera**: conviene revocarlo en
  <https://supabase.com/dashboard/account/tokens> cuando no haya que aplicar
  más migraciones.
