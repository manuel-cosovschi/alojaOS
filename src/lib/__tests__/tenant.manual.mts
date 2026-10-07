/**
 * Qué complejo corresponde a cada host.
 *
 *   npx tsx src/lib/__tests__/tenant.manual.mts
 *
 * Esto no es enrutamiento, es seguridad: el subdominio decide qué datos se
 * leen, y el `Host` lo manda el cliente. Lo que se prueba acá es que de un host
 * raro no salga un complejo, porque de ahí saldrían las reservas de alguien.
 */

process.env.NEXT_PUBLIC_SITE_URL = 'https://alojaos.shop';

const { complejoDelHost, slugValido, dominioRaiz, direccionDelComplejo } = await import('../tenant.js');

let fallas = 0;
const igual = (real: unknown, esperado: unknown, nombre: string) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(
    `${ok ? 'OK    ' : 'FALLA '} ${nombre}` +
      (ok ? '' : `  [esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}]`)
  );
};

igual(dominioRaiz(), 'alojaos.shop', 'el dominio raíz sale del sitio');

// --- Lo que sí es un complejo
igual(complejoDelHost('cabanias-del-sol.alojaos.shop'), 'cabanias-del-sol', 'un subdominio es un complejo');
igual(complejoDelHost('CABANIAS.AlojaOS.Shop'), 'cabanias', 'las mayúsculas no importan');
igual(complejoDelHost('cabanias.alojaos.shop:3000'), 'cabanias', 'el puerto tampoco');
igual(complejoDelHost('cabanias.alojaos.shop.'), 'cabanias', 'ni el punto final');

// --- Lo que NO es un complejo
igual(complejoDelHost('alojaos.shop'), null, 'el dominio principal no es un complejo');
igual(complejoDelHost(null), null, 'sin host no hay complejo');
igual(complejoDelHost(''), null, 'con host vacío tampoco');

// Un host de otro dominio: lo más importante de esta función. Si devolviera el
// primer segmento, cualquiera podría apuntar su propio dominio acá y elegir qué
// complejo leer.
igual(complejoDelHost('cabanias.otrodominio.com'), null, 'un host de otro dominio no da complejo');
igual(complejoDelHost('alojaos.shop.atacante.com'), null, 'ni uno que sólo contiene el dominio');
igual(complejoDelHost('cabanias.alojaos.shop.atacante.com'), null, 'ni con el dominio en el medio');

// Dos niveles: `a.b.alojaos.shop` no es el complejo `a.b` ni el complejo `b`.
igual(complejoDelHost('a.b.alojaos.shop'), null, 'dos niveles de subdominio no dan complejo');

// Subdominios reservados.
igual(complejoDelHost('www.alojaos.shop'), null, 'www no es un complejo');
igual(complejoDelHost('admin.alojaos.shop'), null, 'admin tampoco');
igual(complejoDelHost('api.alojaos.shop'), null, 'ni api');
igual(complejoDelHost('mail.alojaos.shop'), null, 'ni el mail, que rompería el correo');
igual(complejoDelHost('demo-cualquiera.alojaos.shop'), null, 'ni nada que arranque con demo-');

// Slugs mal formados.
igual(complejoDelHost('ab.alojaos.shop'), null, 'menos de 3 caracteres, no');
igual(complejoDelHost('-malo.alojaos.shop'), null, 'no puede arrancar con guión');
igual(complejoDelHost('malo-.alojaos.shop'), null, 'ni terminar con guión');
igual(complejoDelHost('ma--lo.alojaos.shop'), null, 'ni llevar dos guiones seguidos');
igual(complejoDelHost('Mayús.alojaos.shop'), null, 'ni caracteres fuera de a-z0-9-');
igual(complejoDelHost(`${'a'.repeat(41)}.alojaos.shop`), null, 'más de 40 caracteres, no');

// --- slugValido: el mismo criterio que la base
igual(slugValido('cabanias-del-sol'), true, 'un slug normal vale');
igual(slugValido('abc'), true, 'tres caracteres es el mínimo');
igual(slugValido('ab'), false, 'dos, no');
igual(slugValido('admin'), false, 'un reservado no vale');
igual(slugValido('demo-lo-que-sea'), false, 'ni uno que arranque con demo-');
igual(slugValido('con_guion_bajo'), false, 'el guión bajo no está permitido');

// --- La dirección que se le muestra al dueño
igual(direccionDelComplejo('cabanias'), 'https://cabanias.alojaos.shop', 'la dirección del complejo');

// En local, con puerto, tiene que conservarlo o el link no abre.
process.env.NEXT_PUBLIC_SITE_URL = 'http://alojaos.test:3000';
// El módulo ya está cargado y `dominioRaiz()` lee la variable al llamarse, no
// al importarse — pero el formateador de hosts guarda su resultado, así que se
// vuelve a importar con la consulta cambiada para forzar una instancia nueva.
// El tipo se declara `string` a propósito: con un literal, TypeScript intenta
// resolver la ruta con la consulta adentro y no la encuentra.
const conConsulta: string = '../tenant.js?local';
const local = (await import(conConsulta)) as typeof import('../tenant.js');
igual(local.dominioRaiz(), 'alojaos.test', 'en local el dominio raíz pierde el puerto');
igual(local.complejoDelHost('cabanias.alojaos.test:3000'), 'cabanias', 'y el host con puerto sigue dando complejo');
igual(
  local.direccionDelComplejo('cabanias'),
  'http://cabanias.alojaos.test:3000',
  'pero la dirección conserva el puerto'
);

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
