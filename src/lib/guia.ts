/**
 * El guion de la visita guiada del panel.
 *
 * El texto vive acá y no adentro del componente para que se edite como se
 * edita un texto de venta: corrido, en orden, sin tocar React. Es el mismo
 * molde que la guía de GastroOS.
 *
 * Cada paso es de una de dos formas:
 *
 * - `foco`   ilumina una parte del panel y oscurece el resto. «Esto es esto, y
 *            está acá.» Se puede tocar lo iluminado: la guía invita a probar.
 * - `centro` tarjeta al medio, sin señalar nada. Apertura y cierre.
 *
 * Los `objetivo` son atributos `data-guia`, no clases: una clase de Tailwind
 * cambia cuando se retoca el diseño y se lleva puesta la guía. La batería del
 * navegador comprueba que cada uno exista en el panel.
 */

export type FormaDelPaso = 'foco' | 'centro';

export interface PasoDeLaGuia {
  id: string;
  forma: FormaDelPaso;
  /** El valor de `data-guia` del elemento a iluminar. Sólo en los de `foco`. */
  objetivo?: string;
  titulo: string;
  texto: string;
  /** El renglón de abajo: qué probar, dónde mirar. */
  pista?: string;
}

export const PASOS_DE_LA_GUIA: PasoDeLaGuia[] = [
  {
    id: 'bienvenida',
    forma: 'centro',
    titulo: 'Te muestro AlojaOS en dos minutos',
    texto:
      'Esto es una copia tuya de Cabañas del Sol, un complejo inventado de cuatro cabañas. Sos el dueño: probá todo lo que quieras. Nadie más ve lo que hagas, y «Reiniciar» lo deja como estaba.',
    pista: 'Podés cerrar la guía cuando quieras y volver a abrirla con el botón «Guía», arriba.',
  },
  {
    id: 'pagina',
    forma: 'foco',
    objetivo: 'pagina',
    titulo: 'Esta es la página que le mandás al huésped',
    texto:
      'Con tu nombre, tus colores, tus cabañas y tus precios. El huésped elige las noches, ve cuánto sale y deja la seña a la hora que sea, sin escribirte.',
    pista: 'Al final de la guía la vas a abrir y vas a reservar como si fueras un huésped.',
  },
  {
    id: 'senas',
    forma: 'foco',
    objetivo: 'senas',
    titulo: 'Las señas que esperan que las mires',
    texto:
      'Cada reserva llega con su plazo para transferir. Si el huésped subió el comprobante, lo ves con un toque. Confirmás o rechazás desde el teléfono.',
    pista: 'Probá: tocá «Ver» en la de Lucas y confirmala.',
  },
  {
    id: 'plazo',
    forma: 'foco',
    objetivo: 'senas',
    titulo: 'Si no transfiere, las noches se liberan solas',
    texto:
      'Cuando vence el plazo, la seña se cae y esas noches vuelven a estar a la venta. Nadie tiene que acordarse de nada, y nunca se venden dos veces.',
  },
  {
    id: 'fechas',
    forma: 'foco',
    objetivo: 'fechas',
    titulo: 'Cerrá las noches que no querés vender',
    texto:
      'Las que usás vos, o las que vendiste por otro lado. Quedan ocupadas para el que entra a reservar, y se reabren con un toque.',
    pista: 'Ahí está la Navidad que el dueño se guardó para la familia.',
  },
  {
    id: 'precios',
    forma: 'foco',
    objetivo: 'precios',
    titulo: 'Precios por temporada y por cabaña',
    texto:
      'Cargás cada período una vez y el sistema cobra cada noche según su fecha. Si una cabaña no tiene precio en alguna fecha, te avisa: no inventa un número.',
    pista: 'Mirá el aviso de la Cabaña del Tala, que no tiene precio en temporada alta.',
  },
  {
    id: 'reglas',
    forma: 'foco',
    objetivo: 'reglas',
    titulo: 'Mínimo de noches y día de entrada',
    texto:
      'En temporada alta, siete noches entrando sábado o domingo; el resto del año, dos. Y hasta qué fecha se puede reservar. El huésped lo ve explicado antes de elegir.',
  },
  {
    id: 'datos',
    forma: 'foco',
    objetivo: 'datos',
    titulo: 'Dónde te transfieren, y cuánto de seña',
    texto:
      'Tu alias y tu CBU, el porcentaje de seña y cuántas horas tiene el huésped para transferir. La seña va directo a tu cuenta: no pasa por nosotros.',
  },
  {
    id: 'marca',
    forma: 'foco',
    objetivo: 'marca',
    titulo: 'Tu marca, con vista previa',
    texto:
      'Los colores y la tipografía de tu página, y cómo queda antes de guardar. Si elegís un texto que no se va a leer bien, el sistema mide el contraste y te avisa.',
  },
  {
    id: 'exportar',
    forma: 'foco',
    objetivo: 'exportar',
    titulo: 'Tus datos son tuyos',
    texto: 'Te llevás todo en un archivo cuando quieras, sin pedirle permiso a nadie.',
  },
  {
    id: 'huesped',
    forma: 'centro',
    titulo: 'Ahora sé el huésped',
    texto:
      'Abrí tu página, elegí unas noches y reservá. Después volvé a esta pestaña y recargá: la reserva te va a estar esperando en las señas, como le llega a un dueño.',
    pista: 'En la demo no sale ningún mail: podés poner cualquier dirección.',
  },
];

/** Dónde se guarda el progreso, por navegador. */
export const CLAVE_DE_LA_GUIA = 'alojaos:guia';
