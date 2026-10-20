/**
 * El comprobante de ejemplo de la demo.
 *
 *   npm run demo:plantilla
 *
 * La plantilla de la demo (migración 025) trae una seña con comprobante, para
 * que el visitante vea esa pantalla como la ve un dueño: «comprobante subido,
 * Ver». Ese «Ver» abre un archivo, y el archivo tiene que existir.
 *
 * Se dibuja acá y no se usa una foto de un comprobante de verdad por dos
 * razones: uno real tiene el nombre, el CUIT y la cuenta de una persona, y uno
 * con la cara de un banco de verdad es imitar a ese banco. Éste dice lo que es.
 *
 * Vive en `comprobantes/demo/…`, fuera de la carpeta de cualquier complejo: es
 * de todas las demos y ninguna lo borra (ver `borrarArchivosDe` en
 * `src/actions/demo.ts`). Se puede volver a correr: reemplaza el archivo.
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function delEnv(clave: string): string {
  try {
    return readFileSync('.env.local', 'utf-8').match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

const URL_SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? delEnv('NEXT_PUBLIC_SUPABASE_URL');
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? delEnv('SUPABASE_SERVICE_ROLE_KEY');
const RUTA = 'demo/comprobante-de-ejemplo.png';

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#eef1f4; }
  .hoja { width: 360px; margin: 24px auto; background:#fff; border-radius:18px; padding:28px 26px;
          box-shadow: 0 6px 24px rgba(0,0,0,.08); color:#1f2a33; }
  .ok { width:54px; height:54px; border-radius:50%; background:#2e9e6b; color:#fff; font-size:30px;
        display:flex; align-items:center; justify-content:center; margin: 0 auto 14px; }
  h1 { font-size:19px; text-align:center; margin:0 0 4px; }
  .monto { font-size:32px; font-weight:800; text-align:center; margin:10px 0 18px; }
  .fila { display:flex; justify-content:space-between; font-size:13.5px; padding:9px 0; border-top:1px solid #edf0f2; }
  .fila span:first-child { color:#6a7782; }
  .aviso { margin-top:18px; font-size:11.5px; color:#8a96a0; text-align:center; line-height:1.4; }
</style></head><body><div class="hoja">
  <div class="ok">✓</div>
  <h1>Transferencia enviada</h1>
  <div class="monto">$ 682.500</div>
  <div class="fila"><span>Para</span><span>Cabañas del Sol SRL</span></div>
  <div class="fila"><span>Alias</span><span>cabanias.del.sol</span></div>
  <div class="fila"><span>Concepto</span><span>Seña · 7 noches</span></div>
  <div class="fila"><span>Desde</span><span>Lucas Pereyra</span></div>
  <div class="fila"><span>Operación</span><span>0000-EJEMPLO</span></div>
  <div class="aviso">Comprobante de ejemplo de la demo de AlojaOS.<br>No corresponde a ninguna transferencia real.</div>
</div></body></html>`;

async function main() {
  if (!URL_SUPA || !SERVICIO) {
    console.error('\n✗ Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.\n');
    process.exit(1);
  }

  const navegador = await chromium.launch();
  const page = await navegador.newPage({ viewport: { width: 408, height: 520 }, deviceScaleFactor: 2 });
  await page.setContent(HTML);
  const png = await page.locator('.hoja').screenshot({ type: 'png' });
  await navegador.close();

  const servicio = createClient(URL_SUPA, SERVICIO, { auth: { persistSession: false } });
  const { error } = await servicio.storage
    .from('comprobantes')
    .upload(RUTA, png, { contentType: 'image/png', upsert: true });
  if (error) {
    console.error(`\n✗ No pude subir el comprobante de ejemplo: ${error.message}\n`);
    process.exit(1);
  }

  // Y se comprueba que se puede firmar y bajar, que es lo que hace el panel.
  // Subido no es servido.
  const { data: firmado } = await servicio.storage.from('comprobantes').createSignedUrl(RUTA, 60);
  const res = firmado?.signedUrl ? await fetch(firmado.signedUrl) : null;
  if (!res?.ok) {
    console.error(`\n✗ Lo subí pero no lo puedo bajar firmado (HTTP ${res?.status ?? 'sin enlace'}).\n`);
    process.exit(1);
  }
  console.log(`\n✓ comprobantes/${RUTA} — ${Math.round(png.length / 1024)} KB, y se baja firmado\n`);
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : e);
  process.exit(1);
});
