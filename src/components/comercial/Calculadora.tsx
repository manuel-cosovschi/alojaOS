'use client';

/**
 * ¿Cuánto te cuesta una noche que no pudiste vender?
 *
 * ------------------------------------------------------------------
 * Por qué una calculadora y no un número
 * ------------------------------------------------------------------
 * «Perdés plata con las fechas bloqueadas de gratis» es una frase. Un dueño la
 * lee, asiente y se va. El número lo convence recién cuando es SU número, y su
 * número no lo tenemos: depende de cuántas unidades tenga y a cuánto cobre.
 *
 * Así que lo calcula él, con tres datos que sabe de memoria. No se le pide mail
 * ni nombre para ver el resultado: una calculadora que te pide el mail antes
 * del número es un formulario disfrazado, y esta persona lo nota.
 *
 * ------------------------------------------------------------------
 * De dónde sale cada cuenta, y qué NO se inventa
 * ------------------------------------------------------------------
 * Las dos cuentas salen de lo que el producto hace, no de un estudio que no
 * existe:
 *
 *   - **La seña que no llega y no libera.** Si el mecanismo que vence las señas
 *     no corre —y en el sistema del que sale esto no corría— las noches de cada
 *     seña que no se transfirió quedan tomadas hasta que alguien lo note a
 *     mano. Son noches que el dueño no le puede ofrecer a nadie. La cuenta es
 *     noches × precio, y el dueño pone cuántas señas al mes se le caen.
 *   - **La comisión que no pagás.** Booking cobra entre el 15 % y el 18 % de
 *     cada reserva; acá la seña va a la cuenta del dueño y no hay comisión. La
 *     cuenta usa 15 %, el extremo bajo, a propósito: con el alto el número
 *     queda más lindo y menos defendible.
 *
 * Lo que la calculadora NO dice: «vas a facturar un X % más». Eso dependería de
 * que entren más reservas, y de eso no sabemos nada. Dice qué deja de perder,
 * que es lo único que se puede sostener.
 */

import { useMemo, useState } from 'react';
import { MARCA } from '@/lib/marca-alojaos';

const plata = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Math.round(n));

/** Booking cobra 15–18 %. Se usa el extremo bajo. */
const COMISION_DE_LOS_PORTALES = 0.15;

export function Calculadora() {
  const [precio, setPrecio] = useState(90_000);
  const [senasCaidas, setSenasCaidas] = useState(3);
  const [nochesPorSena, setNochesPorSena] = useState(4);
  const [reservasPorMes, setReservasPorMes] = useState(12);

  const cuentas = useMemo(() => {
    const nochesTrabadas = senasCaidas * nochesPorSena;
    const perdidoPorMes = nochesTrabadas * precio;
    const facturadoPorMes = reservasPorMes * nochesPorSena * precio;
    const comisionEvitada = facturadoPorMes * COMISION_DE_LOS_PORTALES;
    return {
      nochesTrabadas,
      perdidoPorMes,
      perdidoPorTemporada: perdidoPorMes * 3,
      comisionEvitada,
      comisionPorTemporada: comisionEvitada * 3,
    };
  }, [precio, senasCaidas, nochesPorSena, reservasPorMes]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <Perilla
          etiqueta="Precio de una noche, en temporada"
          valor={precio}
          min={20_000}
          max={400_000}
          paso={5_000}
          onChange={setPrecio}
          formato={plata}
        />
        <Perilla
          etiqueta="Señas que se te caen por mes"
          ayuda="Gente que reserva, no transfiere, y te deja las fechas tomadas."
          valor={senasCaidas}
          min={0}
          max={20}
          paso={1}
          onChange={setSenasCaidas}
          formato={(n) => `${n}`}
        />
        <Perilla
          etiqueta="Noches de una estadía típica"
          valor={nochesPorSena}
          min={1}
          max={21}
          paso={1}
          onChange={setNochesPorSena}
          formato={(n) => `${n}`}
        />
        <Perilla
          etiqueta="Reservas que cerrás por mes"
          valor={reservasPorMes}
          min={1}
          max={100}
          paso={1}
          onChange={setReservasPorMes}
          formato={(n) => `${n}`}
        />
      </div>

      <div className="space-y-3">
        <Resultado
          titulo="Noches trabadas por señas que nunca llegaron"
          numero={`${cuentas.nochesTrabadas} noches`}
          detalle={`${plata(cuentas.perdidoPorMes)} por mes · ${plata(cuentas.perdidoPorTemporada)} en tres meses de temporada`}
          explicacion="Fechas que figuran ocupadas y no están vendidas. Con AlojaOS se liberan solas cuando vence el plazo, sin que nadie las revise."
          fuerte
        />
        <Resultado
          titulo="Comisión que no le pagás a ningún portal"
          numero={plata(cuentas.comisionEvitada)}
          detalle={`por mes · ${plata(cuentas.comisionPorTemporada)} en tres meses`}
          explicacion="Calculado al 15 %, el extremo bajo de lo que cobran los portales. La seña se transfiere a tu cuenta y no pasa por nosotros."
        />
        <p className="text-xs leading-relaxed" style={{ color: MARCA.textoSuave }}>
          Son tus números, no nuestros promedios. Lo que esta cuenta{' '}
          <strong>no</strong> dice es que vas a vender más: eso dependería de que
          entren más reservas y de eso no sabemos nada. Dice qué dejás de perder.
        </p>
      </div>
    </div>
  );
}

function Perilla({
  etiqueta,
  ayuda,
  valor,
  min,
  max,
  paso,
  onChange,
  formato,
}: {
  etiqueta: string;
  ayuda?: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  onChange: (n: number) => void;
  formato: (n: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{etiqueta}</span>
        <span className="text-sm font-semibold" style={{ color: MARCA.tinta }}>
          {formato(valor)}
        </span>
      </span>
      {ayuda && (
        <span className="mt-0.5 block text-xs" style={{ color: MARCA.textoSuave }}>
          {ayuda}
        </span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#0d3b3e]"
        aria-label={etiqueta}
      />
    </label>
  );
}

function Resultado({
  titulo,
  numero,
  detalle,
  explicacion,
  fuerte = false,
}: {
  titulo: string;
  numero: string;
  detalle: string;
  explicacion: string;
  fuerte?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={
        fuerte
          ? { background: MARCA.tinta, color: 'white' }
          : { background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ opacity: 0.6 }}>
        {titulo}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{numero}</p>
      <p className="mt-0.5 text-sm" style={{ opacity: 0.75 }}>
        {detalle}
      </p>
      <p className="mt-2 text-xs leading-relaxed" style={{ opacity: 0.7 }}>
        {explicacion}
      </p>
    </div>
  );
}
