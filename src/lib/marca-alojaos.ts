/**
 * La identidad de AlojaOS, el producto.
 *
 * Ojo con no confundir esto con la marca de un complejo: la de un complejo es
 * una fila de `complejos` y la escribe su página en `:root`. Esta es la del
 * producto, y vive acá porque la usan la página comercial, el login y el panel
 * —las tres pantallas que son de AlojaOS y no de ningún cliente—.
 *
 * `npm run sin-marca` no se queja de esto y está bien que no: lo que ese chequeo
 * persigue es la marca de un CLIENTE escrita en el código, que es lo que en el
 * sistema anterior terminó en 30 archivos. La marca del producto en un archivo
 * del producto es exactamente donde va.
 *
 * Los colores: verde profundo y crema, que es lo que se ve en la costa
 * atlántica sin ser una postal. El terracota es el acento y se usa poco, para
 * los botones y nada más: un acento que aparece en diez lugares deja de ser un
 * acento.
 */

export const MARCA = {
  tinta: '#0d3b3e',
  tintaSuave: '#1b5457',
  crema: '#fbf9f5',
  cremaHonda: '#f3efe7',
  acento: '#c25a34',
  acentoHondo: '#a8451f',
  salvia: '#7fa89b',
  texto: '#13201f',
  textoSuave: '#4a5a58',
} as const;

/**
 * La paleta oscura de la página comercial.
 *
 * ==================================================================
 * Por qué la página de venta es oscura y el producto no
 * ==================================================================
 * Son dos pantallas con dos trabajos distintos. La del complejo la abre un
 * huésped para elegir fechas: tiene que verse liviana, clara, y con los colores
 * del complejo, no con los nuestros. La de venta la abre un dueño para decidir
 * si confía en nosotros, y ahí lo que tiene que transmitir es que esto lo hizo
 * alguien que sabe. Oscuro, con una tipografía con carácter y el acento usado
 * poco, hace eso.
 *
 * ==================================================================
 * De dónde salen los colores
 * ==================================================================
 * Del mismo verde profundo de siempre, llevado hasta el fondo: `noche` es
 * `tinta` oscurecida hasta que sirve de lienzo, y mantiene el tinte verdoso en
 * vez de ser un gris. Eso es lo que hace que no parezca la plantilla oscura de
 * nadie.
 *
 * `menta` es el único color nuevo y aparece sólo en rótulos, tildes e íconos:
 * en oscuro hace falta un color que se lea a tamaño chico, y el terracota a
 * 12 px sobre negro se apaga.
 *
 * `accion` es el terracota de siempre **un punto más oscuro**, y eso no es
 * gusto: con `#c25a34` el texto blanco encima da 4,37:1 y la norma pide 4,5
 * para texto normal. Está comprobado en `contraste.manual.mts`, que falla si
 * alguien lo aclara.
 */
export const NOCHE = {
  /** El fondo principal. */
  fondo: '#06191b',
  /** La franja alterna, un escalón más honda. */
  fondoHondo: '#041214',
  /** El fondo de una tarjeta sobre el fondo principal. */
  tarjeta: 'rgba(255,255,255,.045)',
  /** El borde de esa tarjeta: casi no se ve, y es lo que la separa del fondo. */
  borde: 'rgba(255,255,255,.09)',
  /** El texto principal. */
  texto: '#ffffff',
  /** El de los párrafos: blanco apagado con el mismo tinte verdoso. */
  textoSuave: '#9fb5b3',
  /** El de las aclaraciones chicas. */
  textoTenue: '#6e8886',
  /** Rótulos, tildes e íconos. */
  menta: '#6fd6ae',
  /** Los botones y las franjas de acción. */
  accion: '#b14e2b',
  accionViva: '#d0663c',
} as const;
