/**
 * El complejo que la página comercial nombra.
 *
 * ==================================================================
 * Por qué esto es un archivo y no tres líneas adentro de `Comercial.tsx`
 * ==================================================================
 * `npm run sin-marca` falla si el nombre de un complejo aparece como texto en
 * el código, y la regla es buena: en el sistema del que sale AlojaOS la marca
 * del cliente terminó en treinta archivos, y un complejo nuevo no entraba.
 *
 * Pero la página comercial no es la página de un inquilino: es la de AlojaOS, y
 * nombrar al complejo del que salió el producto es exactamente lo que tiene que
 * hacer. Así que la excepción existe, está acotada a ESTE archivo, y está
 * anotada en `scripts/sin-marca.ts` al lado de la regla que la concede. Un solo
 * archivo con un nombre de cliente adentro es auditable; el nombre suelto por
 * la base de código es el problema que la regla previene.
 *
 * ==================================================================
 * Qué se puede escribir acá
 * ==================================================================
 * Lo que es verdad y es comprobable. El dueño del complejo dio su permiso para
 * que se lo nombre —nombrar a un cliente sin que lo sepa no es una decisión de
 * diseño, es un problema—. Lo que NO va, y no va a ir:
 *
 *   - **Un testimonio.** Si no lo dijo él, es inventado, y se cae con una sola
 *     pregunta: «¿me pasás su teléfono?».
 *   - **Números de resultados.** Ni ocupación, ni reservas, ni horas ahorradas.
 *     No los medimos. La calculadora de la página usa los números del que lee,
 *     que es lo único sostenible.
 *
 * Lo que queda es más fuerte que cualquiera de las dos cosas: el sistema corre
 * en un complejo de verdad, con nombre y dirección, y los tres errores que
 * encontramos auditándolo están escritos abajo con el detalle de cuántos meses
 * duraron. Eso no se improvisa.
 */

export const CASO = {
  nombre: 'Las Cañas',
  localidad: 'Mar de Cobo',
  provincia: 'Buenos Aires',
  unidades: 5,

  /** Lo que el complejo hace con el sistema, sin adjetivos. */
  queHace: [
    'Toma las reservas en su propia página, con su nombre y sus colores.',
    'Cobra la seña por transferencia, con un plazo que corre solo.',
    'Maneja mínimos de noches y días de entrada por temporada.',
    'No paga comisión por reserva a nadie.',
  ],
} as const;

/**
 * Los tres errores que encontró la auditoría, antes de convertir ese sistema en
 * un producto.
 *
 * Contarlos es la credibilidad de la página entera. Un proveedor que te muestra
 * los tres errores que encontró y cómo los cerró es más creíble que uno que te
 * dice que su sistema es excelente —sobre todo para alguien a quien ya le
 * prometieron uno excelente.
 */
export const HALLAZGOS = [
  {
    titulo: 'Ningún comprobante se guardó nunca',
    cuanto: 'Desde el primer día, meses',
    texto:
      'La subida contestaba «listo» y el archivo no llegaba a ninguna parte: el error de guardado se ignoraba a propósito, con un argumento razonable —un problema de almacenamiento no puede cortarle la reserva a un huésped—. El panel decía «sin comprobante» para todos y nadie supo por qué.',
    comoSeArreglo:
      'Acá la reserva tampoco se cae. Lo que no se hace es decir que el comprobante llegó cuando no llegó: después de subir, la pantalla le vuelve a preguntar a la base, y si la base dice que no, la persona lo ve y puede reintentar.',
  },
  {
    titulo: 'Desbloquear una fecha no desbloqueaba nada',
    cuanto: 'Siete meses',
    texto:
      'El botón contestaba «listo, 1 fecha liberada» sin tocar la base. El dueño cerraba el panel tranquilo y la fecha seguía bloqueada.',
    comoSeArreglo:
      'Un bloqueo es una fila, igual que una reserva. Desbloquear le cambia el estado y la base cuenta las filas que cambió. No hay dónde inventar un número.',
  },
  {
    titulo: 'El reloj que vencía las señas estaba apagado',
    cuanto: 'Sin fecha conocida',
    texto:
      'Las señas que no se transferían no vencían solas. Las noches quedaban tomadas hasta que alguien lo notaba a mano, y no había ninguna pantalla donde notarlo.',
    comoSeArreglo:
      'Corre en la base cada cinco minutos, y el panel te dice si NO está corriendo. Que exista una tarea programada no es que esté corriendo: el panel mira la última vez que corrió de verdad.',
  },
] as const;
