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
