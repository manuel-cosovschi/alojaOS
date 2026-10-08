/**
 * Cuánto cuesta AlojaOS.
 *
 * ==================================================================
 * Todo en un archivo, a propósito
 * ==================================================================
 * Cambiar un precio tiene que ser cambiar un número acá y nada más. En el
 * sistema del que sale este producto, el precio de cada unidad era una COLUMNA
 * de una tabla —LC1, LC2, LC3…— y agregar una cabaña era una migración. La
 * lección se aplica también al precio del producto: un número que vive en tres
 * lugares es un número que en algún momento dice dos cosas distintas.
 *
 * ==================================================================
 * De dónde salen estos números
 * ==================================================================
 * Tres anclas, en orden de peso:
 *
 *   1. **El competidor argentino con precios públicos.** Pxsol publica su PMS
 *      en ARS 91.800/mes + IVA (Professional) y 153.000 + IVA (Enterprise), con
 *      el motor de reservas cobrado APARTE, desde USD 60/mes. O sea: el que
 *      compara en serio ya vio un número de seis cifras antes de llegar acá.
 *   2. **Lo que cobra una noche este cliente.** Temporada alta 2026: Cosquín
 *      ronda los $67.800 por noche, Mar del Plata entre $82.000 y $110.000,
 *      Villa Gesell promedia $93.500 y la lista oficial arranca en $138.000 para
 *      cuatro personas. O sea: el abono de un mes es menos de lo que cobra por
 *      UNA noche. Es la comparación que esta persona puede hacer sola, de
 *      memoria, mientras lee.
 *   3. **GastroOS**, el producto hermano del mismo estudio y el mismo mercado:
 *      $15.000 a $89.000 por mes, con puesta a punto de $55.000 a $95.000.
 *      Estos números tienen que convivir con ésos sin que ninguno parezca de
 *      otro negocio.
 *
 * ==================================================================
 * Por qué se cobra por UNIDADES y no por reservas
 * ==================================================================
 * GastroOS cobra por pedidos y acá sería un error copiarlo. Las reservas de un
 * complejo son brutalmente estacionales: cuarenta en enero y dos en junio. Un
 * abono atado a eso le cobra caro cuando factura y barato cuando no, que es lo
 * contrario de lo que el cliente quiere, y además hace que la factura cambie
 * todos los meses.
 *
 * Las unidades, en cambio, no se mueven: el que tiene cinco cabañas tiene cinco
 * cabañas en enero y en junio. El precio es previsible para los dos y la
 * conversación de venta dura un minuto: «¿cuántas unidades tenés?».
 *
 * ==================================================================
 * El pago por temporada
 * ==================================================================
 * La estacionalidad igual es un problema, pero del otro lado: en junio este
 * cliente tiene poca plata y un abono mensual es justo lo que se corta. Por eso
 * existe la opción de pagar el año en tres cuotas de temporada, con dos meses
 * bonificados. Cobra cuando el cliente tiene caja y le da a él un descuento de
 * verdad por adelantar.
 *
 * No es permanencia: se puede dejar cuando quiera y se le devuelve la parte no
 * usada. «Sin permanencia» está escrito en la página y tiene que ser cierto.
 */

export interface Plan {
  nombre: string;
  unidades: string;
  /** Abono mensual, en pesos. */
  mensual: number;
  /** Puesta a punto por única vez. */
  puestaAPunto: number;
  destacado?: boolean;
  /** Para quién es, en una línea. */
  paraQuien: string;
}

export const PLANES: Plan[] = [
  {
    nombre: 'Chico',
    unidades: 'Hasta 5 unidades',
    mensual: 29_000,
    puestaAPunto: 65_000,
    paraQuien: 'Tres a cinco cabañas, atendidas por la familia.',
  },
  {
    nombre: 'Complejo',
    unidades: 'De 6 a 10 unidades',
    mensual: 45_000,
    puestaAPunto: 90_000,
    destacado: true,
    paraQuien: 'El tamaño para el que está hecho esto.',
  },
  {
    nombre: 'Grande',
    unidades: 'De 11 a 15 unidades',
    mensual: 65_000,
    puestaAPunto: 120_000,
    paraQuien: 'Varios bloques o más de una ubicación.',
  },
];

/** Meses que se pagan si se adelanta la temporada completa. */
export const MESES_QUE_SE_PAGAN_POR_ANIO = 10;
export const CUOTAS_DE_TEMPORADA = 3;

/**
 * El piso de lo que cobran los sistemas que compiten, por mes y sin IVA.
 *
 * No se nombra al proveedor: una página de venta que nombra a un competidor lo
 * pone en la conversación, y además el número puede cambiar mañana y la página
 * queda mintiendo sobre un tercero. El rango es verificable buscando «PMS
 * Argentina precios».
 */
export const PISO_DE_LOS_SISTEMAS_GRANDES = 91_800;
