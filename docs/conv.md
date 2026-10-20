# Página de conversión (`alojaos.shop/conv`)

A donde llegan los anuncios. AlojaOS no se vende online, así que el objetivo es
**la consulta** (camino B): el formulario guarda en la tabla `consultas`
(migración 028, sólo la escribe el servidor) y avisa por mail con Resend.
`ok` sólo si la fila se guardó; si no, el visitante ve el error y reintenta.

Mismo sistema que GastroOS (documentado en `gastroOS/docs/conv.md`): mismos
nombres de eventos, misma cookie de atribución (`conv_atrib`), mismo `?v=` para
variantes (`base`, `comision`, `whatsapp`, en `src/app/conv/variantes.ts`).
`src/lib/conv/` y `src/components/conv/Rastreo.tsx` son copias de los de
GastroOS: si se cambia uno, se cambia el otro.

## Variables (Vercel)

| Variable | Para qué | Estado |
|---|---|---|
| `NEXT_PUBLIC_META_PIXEL_ID` | Píxel de Meta | falta |
| `META_CAPI_TOKEN` | Lead por la API de conversiones | falta |
| `NEXT_PUBLIC_GA4_ID` | GA4 | falta |
| `CONV_AVISO_A` | A quién llega cada consulta (si no, `NEXT_PUBLIC_MAIL_CONTACTO`) | opcional |
| `RESEND_API_KEY`, `RESEND_DE` | El mail de aviso | los mismos de los avisos de reservas |

## Ver las consultas

Hoy no tienen pantalla: están en la tabla `consultas` de Supabase (Table
Editor). El campo `estado` (`nueva`, `contactada`, `cliente`, `descartada`) es
para cerrar el circuito lead → cliente cuando se haga la pantalla.

## Pruebas

`npm run prueba:conv` (14 pruebas; contra `ALOJAOS_BASE`, por defecto
`http://localhost:3002`). Con `CONV_PRUEBA_REAL=1` manda una consulta de verdad
a nombre de «ZZ Prueba conv (borrar)», que hay que borrar a mano.
