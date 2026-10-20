/**
 * A qué direcciones no se les manda.
 *
 *   npx tsx src/lib/__tests__/mail.manual.mts
 *
 * Lo que se prueba es la frontera: los dominios que no existen por norma no
 * salen —cada uno es un rebote, y los rebotes frenan la cuenta—, y cualquier
 * otro sí, incluida la casilla de prueba de Resend con la que las baterías
 * comprueban que el mail sale de verdad.
 */

const { esDeUnDominioDePrueba } = await import('../mail.js');

let fallas = 0;
const igual = (real: unknown, esperado: unknown, nombre: string) => {
  const ok = real === esperado;
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK    ' : 'FALLA '} ${nombre}` + (ok ? '' : `  [esperaba ${esperado}, dio ${real}]`));
};

// --- No salen: no existen
igual(esDeUnDominioDePrueba('prueba@ejemplo.test'), true, '.test no sale');
igual(esDeUnDominioDePrueba('Alguien@Ejemplo.TEST '), true, 'ni en mayúsculas ni con espacios');
igual(esDeUnDominioDePrueba('a@algo.example'), true, '.example no sale');
igual(esDeUnDominioDePrueba('a@algo.invalid'), true, '.invalid no sale');
igual(esDeUnDominioDePrueba('a@localhost.localhost'), true, '.localhost no sale');
igual(esDeUnDominioDePrueba('a@example.com'), true, 'example.com no sale');
igual(esDeUnDominioDePrueba('a@example.org'), true, 'example.org no sale');

// --- Salen: existen
igual(esDeUnDominioDePrueba('delivered+navegador@resend.dev'), false, 'la casilla de prueba de Resend sale');
igual(esDeUnDominioDePrueba('huesped@gmail.com'), false, 'un mail común sale');
igual(esDeUnDominioDePrueba('a@ejemplo.com'), false, 'ejemplo.com es un dominio real: sale');
igual(esDeUnDominioDePrueba('a@contest.com.ar'), false, 'que diga «test» adentro no alcanza');
igual(esDeUnDominioDePrueba('a@miexample.com'), false, 'ni que termine en «example.com» sin ser ese dominio');

if (fallas > 0) {
  console.error(`\n${fallas} falla(s)`);
  process.exit(1);
}
console.log('\nTodo bien.');
