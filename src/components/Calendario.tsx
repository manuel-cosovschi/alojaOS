'use client';

/**
 * El calendario con el que se eligen las noches.
 *
 * Muestra qué noches están tomadas y deja elegir entrada y salida tocando dos
 * días. Está hecho a mano y no con una librería de fechas porque lo que hace
 * falta es muy poco —un mes, días marcados, dos clics— y porque las reglas de
 * este producto (la salida de una es la entrada de la siguiente, `hasta`
 * inclusivo en los tramos) ya están escritas en `src/lib`, y una librería con
 * sus propias convenciones es una fuente de desacuerdos.
 *
 * Lo que se marca, y por qué cada cosa:
 *
 *   - **Ocupada**: hay una reserva, una seña viva o un bloqueo del dueño. Una
 *     noche ocupada es información pública; quién la ocupa, no, y esta pantalla
 *     no lo recibe.
 *   - **Fuera de la ventana**: antes de hoy, antes de la primera fecha o después
 *     de la última noche que el dueño abrió.
 *   - **Entrada no permitida**: en los tramos donde el dueño exige entrar un día
 *     determinado (lo que antes era la temporada alta escrita en el código).
 *
 * Nada de esto es la garantía. La garantía está en la base: `crear_reserva()`
 * vuelve a validar todo y la restricción de exclusión impide la superposición.
 * Esto es para que la persona no pierda el tiempo eligiendo algo que va a
 * rebotar.
 */

import { useMemo, useState } from 'react';
import { type DiaISO, diaDeSemana, noches, seSuperponen, sumarDias } from '@/lib/fechas';
import { minimoPara, primerCheckInPosible, type Reglas } from '@/lib/calendario';

const NOMBRE_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const INICIAL_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export interface Ocupada {
  check_in: DiaISO;
  check_out: DiaISO;
}

interface Props {
  reglas: Reglas;
  ocupadas: Ocupada[];
  checkIn: DiaISO | null;
  checkOut: DiaISO | null;
  onElegir: (checkIn: DiaISO | null, checkOut: DiaISO | null) => void;
}

export function Calendario({ reglas, ocupadas, checkIn, checkOut, onElegir }: Props) {
  const desde = primerCheckInPosible(reglas);
  const [mes, setMes] = useState(() => primerDiaDelMes(checkIn ?? desde));

  const dias = useMemo(() => diasDelMes(mes), [mes]);

  /** Si esa noche ya está tomada. Se mira la NOCHE, no el día. */
  const nocheOcupada = (dia: DiaISO) =>
    ocupadas.some((o) => dia >= o.check_in && dia < o.check_out);

  const fueraDeVentana = (dia: DiaISO) =>
    dia < desde || dia > reglas.config.ultima_fecha;

  /**
   * Si se puede ENTRAR ese día.
   *
   * Entrar el día que otra reserva se va no se pisa, así que un día que es
   * `check_out` de una reserva sigue siendo entrada válida: lo que se mira es
   * si la noche de ese día está libre.
   */
  const puedeEntrar = (dia: DiaISO) => {
    if (fueraDeVentana(dia) || nocheOcupada(dia)) return false;
    const m = minimoPara(reglas, dia, sumarDias(dia, 1));
    return !m.dias || m.dias.includes(diaDeSemana(dia));
  };

  /** Si se puede SALIR ese día, habiendo entrado en `checkIn`. */
  const puedeSalir = (entrada: DiaISO, dia: DiaISO) => {
    if (dia <= entrada) return false;
    // Una salida un día después de la última noche abierta es válida.
    if (dia > sumarDias(reglas.config.ultima_fecha, 1)) return false;
    // Ninguna noche del tramo puede estar tomada.
    return !ocupadas.some((o) => seSuperponen(entrada, dia, o.check_in, o.check_out));
  };

  const elegir = (dia: DiaISO) => {
    // Sin entrada, o ya con las dos elegidas: empieza de nuevo.
    if (!checkIn || checkOut) {
      if (!puedeEntrar(dia)) return;
      onElegir(dia, null);
      return;
    }
    if (dia <= checkIn) {
      if (puedeEntrar(dia)) onElegir(dia, null);
      return;
    }
    if (!puedeSalir(checkIn, dia)) return;
    onElegir(checkIn, dia);
  };

  const enElRango = (dia: DiaISO) =>
    !!checkIn && !!checkOut && dia >= checkIn && dia < checkOut;

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMes(sumarMeses(mes, -1))}
          className="rounded-lg px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-30"
          disabled={mes <= primerDiaDelMes(desde)}
          aria-label="Mes anterior"
        >
          ←
        </button>
        <div className="text-sm font-medium">
          {NOMBRE_MES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}
        </div>
        <button
          type="button"
          onClick={() => setMes(sumarMeses(mes, 1))}
          className="rounded-lg px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-30"
          disabled={mes >= primerDiaDelMes(reglas.config.ultima_fecha)}
          aria-label="Mes siguiente"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs opacity-60">
        {INICIAL_DIA.map((d, i) => (
          <div key={i} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {/* Los huecos hasta el primer día del mes. */}
        {Array.from({ length: diaDeSemana(dias[0]) }).map((_, i) => (
          <div key={`hueco-${i}`} />
        ))}

        {dias.map((dia) => {
          const ocupada = nocheOcupada(dia);
          const fuera = fueraDeVentana(dia);
          const esEntrada = dia === checkIn;
          const esSalida = dia === checkOut;
          const dentro = enElRango(dia);

          const elegible = checkIn && !checkOut ? puedeSalir(checkIn, dia) || puedeEntrar(dia) : puedeEntrar(dia);

          return (
            <button
              key={dia}
              type="button"
              onClick={() => elegir(dia)}
              disabled={!elegible && !esEntrada}
              aria-label={etiqueta(dia, { ocupada, fuera })}
              aria-pressed={esEntrada || esSalida}
              className={[
                'aspect-square rounded-lg text-sm transition',
                esEntrada || esSalida
                  ? 'bg-marca-principal font-semibold text-white'
                  : dentro
                    ? 'bg-marca-principal/15'
                    : '',
                ocupada ? 'text-black/25 line-through' : '',
                fuera && !ocupada ? 'text-black/20' : '',
                elegible && !esEntrada && !esSalida && !dentro ? 'hover:bg-black/5' : '',
                !elegible && !esEntrada ? 'cursor-not-allowed' : '',
              ].join(' ')}
            >
              {Number(dia.slice(8, 10))}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs opacity-60">
        Las noches tachadas están ocupadas. El día que alguien se va es día de
        entrada para el siguiente.
      </p>

      {checkIn && checkOut && (
        <p className="mt-2 text-sm">
          {noches(checkIn, checkOut)}{' '}
          {noches(checkIn, checkOut) === 1 ? 'noche' : 'noches'} ·{' '}
          <button type="button" className="underline" onClick={() => onElegir(null, null)}>
            elegir otras fechas
          </button>
        </p>
      )}
    </div>
  );
}

function etiqueta(dia: DiaISO, { ocupada, fuera }: { ocupada: boolean; fuera: boolean }) {
  const [a, m, d] = dia.split('-');
  const base = `${Number(d)} de ${NOMBRE_MES[Number(m) - 1]} de ${a}`;
  if (ocupada) return `${base}, ocupada`;
  if (fuera) return `${base}, no disponible`;
  return base;
}

function primerDiaDelMes(dia: DiaISO): DiaISO {
  return `${dia.slice(0, 7)}-01`;
}

function sumarMeses(primeroDelMes: DiaISO, cuantos: number): DiaISO {
  const a = Number(primeroDelMes.slice(0, 4));
  const m = Number(primeroDelMes.slice(5, 7)) - 1 + cuantos;
  const anio = a + Math.floor(m / 12);
  const mes = ((m % 12) + 12) % 12;
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
}

function diasDelMes(primeroDelMes: DiaISO): DiaISO[] {
  const a = Number(primeroDelMes.slice(0, 4));
  const m = Number(primeroDelMes.slice(5, 7));
  // El día 0 del mes siguiente es el último de este, y así no hay tabla de
  // días por mes ni caso especial para los años bisiestos.
  const cuantos = new Date(a, m, 0).getDate();
  return Array.from({ length: cuantos }, (_, i) => `${primeroDelMes.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`);
}
