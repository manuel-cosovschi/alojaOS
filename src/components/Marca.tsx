'use client';

/**
 * Los colores y las tipografías de la página del complejo.
 *
 * ------------------------------------------------------------------
 * Por qué esta pantalla tiene vista previa y no podría no tenerla
 * ------------------------------------------------------------------
 * Cuando construí la pantalla de datos del complejo dejé la marca afuera y
 * escribí el motivo: «dar un campo de color sin forma de ver el resultado es
 * peor que no darlo». Un dueño que elige cuatro colores a ciegas y guarda tiene
 * que entrar a su propia página en otra pestaña para ver si quedó espantosa, y
 * si quedó, no sabe cuál de los cuatro fue.
 *
 * Así que la mitad de este archivo es la vista previa, y usa **las mismas
 * variables CSS y las mismas clases de Tailwind** que la página de verdad
 * (`src/app/page.tsx` pone `--marca-principal` y compañía en el `style` del
 * contenedor; `Reservar` y `Calendario` leen `bg-marca-principal`). No es un
 * dibujo parecido: es el mismo mecanismo con otro contenido.
 *
 * ------------------------------------------------------------------
 * El aviso de legibilidad
 * ------------------------------------------------------------------
 * Un contraste bajo entre el texto y el fondo no se rechaza: es su página. Lo
 * que no puede pasar es que lo elija sin que nadie se lo diga. La página se ve
 * bien en el monitor donde se eligió y no se lee en un celular al sol, y el que
 * no pudo leerla no escribe para avisar: se va.
 *
 * El número sale de `src/lib/contraste.ts`, que es la misma cuenta que hace la
 * base al guardar. Está en dos lugares porque el aviso tiene que aparecer
 * mientras el dueño mueve el color, no un guardado después; y las dos están
 * atadas por pruebas que afirman los mismos valores.
 *
 * ------------------------------------------------------------------
 * Las tipografías son una lista y no un campo
 * ------------------------------------------------------------------
 * Lo que se guarda ahí termina en el `font-family` del navegador de cada
 * huésped. Y ninguna de las seis carga una fuente de un tercero: eso le
 * contaría a ese tercero quién visitó la página del complejo, y mueve el texto
 * cuando termina de bajar, que en un celular con mala señal es peor que usar la
 * fuente que el teléfono ya tiene.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { guardarMarca, type Resultado } from '@/actions/panel';
import { contraste, CONTRASTE_MINIMO, normalizarHex } from '@/lib/contraste';
import type { ComplejoDelDuenio, Tipografia } from '@/lib/panel';

const CAMPOS = [
  { clave: 'principal', titulo: 'Principal', ayuda: 'Los botones y lo que está elegido' },
  { clave: 'fondo', titulo: 'Fondo', ayuda: 'El fondo de toda la página' },
  { clave: 'texto', titulo: 'Texto', ayuda: 'Las letras' },
  { clave: 'acento', titulo: 'Acento', ayuda: 'Los detalles y los precios' },
] as const;

type Clave = (typeof CAMPOS)[number]['clave'];

export function Marca({
  complejo,
  tipografias,
}: {
  complejo: ComplejoDelDuenio;
  tipografias: Tipografia[];
}) {
  const router = useRouter();
  const [enCurso, empezar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const [colores, setColores] = useState<Record<Clave, string>>({
    principal: complejo.color_principal,
    fondo: complejo.color_fondo,
    texto: complejo.color_texto,
    acento: complejo.color_acento,
  });

  // La columna guarda la PILA de CSS; la pantalla trabaja con la clave. Se
  // resuelve buscando la pila en la lista: así no hay que guardar las dos cosas
  // ni mantenerlas de acuerdo.
  const claveDe = (pila: string | null) =>
    pila === null ? '' : (tipografias.find((t) => t.pila === pila)?.clave ?? '');

  const [titulos, setTitulos] = useState(claveDe(complejo.tipografia_titulos));
  const [cuerpo, setCuerpo] = useState(claveDe(complejo.tipografia_cuerpo));

  const malos = CAMPOS.filter((c) => normalizarHex(colores[c.clave]) === null);
  const listo = malos.length === 0;
  const relacion = useMemo(() => contraste(colores.texto, colores.fondo), [colores]);

  function enviar() {
    if (!listo) return;
    empezar(async () => {
      const r = await guardarMarca(
        complejo.id,
        colores.principal,
        colores.fondo,
        colores.texto,
        colores.acento,
        titulos || null,
        cuerpo || null
      );
      setResultado(r);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
      <h3 className="font-semibold">Cómo se ve tu página</h3>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <Color
                key={c.clave}
                titulo={c.titulo}
                ayuda={c.ayuda}
                valor={colores[c.clave]}
                onCambio={(v) => setColores((cs) => ({ ...cs, [c.clave]: v }))}
              />
            ))}
          </div>

          {malos.length > 0 && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-900">
              {malos.map((m) => m.titulo).join(' y ')}{' '}
              {malos.length === 1 ? 'no es un color' : 'no son colores'}: van en
              hexadecimal, como <code>#1f2937</code>.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Fuente
              titulo="Títulos"
              valor={titulos}
              opciones={tipografias}
              onCambio={setTitulos}
            />
            <Fuente
              titulo="Texto"
              valor={cuerpo}
              opciones={tipografias}
              onCambio={setCuerpo}
            />
          </div>

          <Legibilidad relacion={relacion} />

          {resultado && (
            <p
              className={`rounded-xl px-3 py-2 text-sm ${
                resultado.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
              }`}
            >
              {resultado.mensaje}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!listo || enCurso}
              onClick={enviar}
              className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {enCurso ? 'Guardando…' : 'Guardar'}
            </button>
            {/* Volver a lo de fábrica sin tener que acordarse de cuatro códigos
                hexadecimales. No guarda: deja los campos puestos y la vista
                previa cambia, así se ve antes de confirmar. */}
            <button
              type="button"
              onClick={() => {
                setColores({
                  principal: '#1f2937',
                  fondo: '#f8f7f4',
                  texto: '#111827',
                  acento: '#b45309',
                });
                setTitulos('');
                setCuerpo('');
              }}
              className="text-sm underline opacity-70"
            >
              Volver a los colores de fábrica
            </button>
          </div>
        </div>

        <VistaPrevia
          colores={colores}
          pilaTitulos={tipografias.find((t) => t.clave === titulos)?.pila}
          pilaCuerpo={tipografias.find((t) => t.clave === cuerpo)?.pila}
          nombre={complejo.nombre}
          localidad={complejo.localidad}
          moneda={complejo.moneda}
        />
      </div>
    </div>
  );
}

/**
 * Un color: la muestra nativa y el hexadecimal escrito.
 *
 * Los dos, y no uno: el selector del navegador sirve para explorar, y el campo
 * de texto para pegar el código exacto que el dueño ya tiene de su cartel o de
 * su logo. Con sólo el selector, acertar un color dado es imposible.
 */
function Color({
  titulo,
  ayuda,
  valor,
  onCambio,
}: {
  titulo: string;
  ayuda: string;
  valor: string;
  onCambio: (v: string) => void;
}) {
  const normal = normalizarHex(valor);

  return (
    <label className="block text-sm">
      <span className="opacity-70">{titulo}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="color"
          aria-label={`${titulo}, selector`}
          // El `input[type=color]` sólo acepta `#rrggbb`. Si lo escrito todavía
          // no es un color válido se le pasa negro, para que no quede en un
          // estado raro mientras el dueño escribe.
          value={normal ?? '#000000'}
          onChange={(e) => onCambio(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-black/15 bg-white"
        />
        <input
          aria-label={`${titulo}, hexadecimal`}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder="#1f2937"
          className={`min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 font-mono text-xs outline-none ${
            normal === null ? 'border-red-400' : 'border-black/15 focus:border-black/40'
          }`}
        />
      </span>
      <span className="mt-0.5 block text-xs opacity-60">{ayuda}</span>
    </label>
  );
}

function Fuente({
  titulo,
  valor,
  opciones,
  onCambio,
}: {
  titulo: string;
  valor: string;
  opciones: Tipografia[];
  onCambio: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="opacity-70">{titulo}</span>
      <select
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 outline-none focus:border-black/40"
      >
        <option value="">La del sistema</option>
        {opciones.map((t) => (
          <option key={t.clave} value={t.clave}>
            {t.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * El contraste entre el texto y el fondo.
 *
 * Tres estados, y el del medio es el que importa: 3 a 4,5 es «se lee en una
 * pantalla buena y no se lee afuera», que es justo donde un dueño se equivoca
 * sin darse cuenta.
 */
function Legibilidad({ relacion }: { relacion: number | null }) {
  if (relacion === null) return null;

  const coma = (n: number) => n.toFixed(2).replace('.', ',');

  if (relacion >= CONTRASTE_MINIMO) {
    return (
      <p className="text-xs text-emerald-800">
        Contraste {coma(relacion)}:1 — se lee bien, también en un celular al sol.
      </p>
    );
  }
  if (relacion >= 3) {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Contraste {coma(relacion)}:1. Se lee en una pantalla buena y cuesta
        afuera. El mínimo recomendado es 4,5.
      </p>
    );
  }
  return (
    <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-900">
      Contraste {coma(relacion)}:1 — <strong>así casi no se lee.</strong> Lo
      podés guardar igual, es tu página, pero mucha gente no va a poder leerla y
      no te lo va a decir: se va.
    </p>
  );
}

/**
 * La página del huésped, en chico.
 *
 * Las mismas variables CSS y las mismas clases que la página de verdad. Los
 * números y los nombres son de mentira; lo que se está mirando es el color.
 */
function VistaPrevia({
  colores,
  pilaTitulos,
  pilaCuerpo,
  nombre,
  localidad,
  moneda,
}: {
  colores: Record<Clave, string>;
  pilaTitulos?: string;
  pilaCuerpo?: string;
  nombre: string;
  localidad: string | null;
  moneda: string;
}) {
  const estilo = {
    '--marca-principal': normalizarHex(colores.principal) ?? '#1f2937',
    '--marca-fondo': normalizarHex(colores.fondo) ?? '#f8f7f4',
    '--marca-texto': normalizarHex(colores.texto) ?? '#111827',
    '--marca-acento': normalizarHex(colores.acento) ?? '#b45309',
    ...(pilaTitulos ? { '--fuente-titulo': pilaTitulos } : {}),
    ...(pilaCuerpo ? { '--fuente-cuerpo': pilaCuerpo } : {}),
    background: 'var(--marca-fondo)',
    color: 'var(--marca-texto)',
    fontFamily: 'var(--fuente-cuerpo)',
  } as React.CSSProperties;

  const plata = (n: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div>
      <p className="mb-1 text-xs opacity-60">Así la ve el huésped:</p>
      <div
        style={estilo}
        className="overflow-hidden rounded-xl border border-black/15 text-sm"
      >
        <div className="border-b border-black/10 px-4 py-3">
          <p className="text-lg font-semibold" style={{ fontFamily: 'var(--fuente-titulo)' }}>
            {nombre}
          </p>
          {localidad && <p className="text-xs opacity-70">{localidad}</p>}
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap gap-1.5">
            {/* Un día elegido, dos libres y uno ocupado: las tres formas en que
                el calendario de verdad usa el color principal. */}
            {['12', '13', '14'].map((d, i) => (
              <span
                key={d}
                className={`grid h-8 w-8 place-items-center rounded-lg text-xs ${
                  i === 0
                    ? 'bg-marca-principal font-semibold text-white'
                    : 'bg-marca-principal/15'
                }`}
              >
                {d}
              </span>
            ))}
            <span className="grid h-8 w-8 place-items-center rounded-lg text-xs line-through opacity-40">
              15
            </span>
          </div>

          <div className="rounded-xl border border-marca-principal bg-marca-principal/10 px-3 py-2">
            <p className="font-medium">Cabaña de ejemplo</p>
            <p className="text-xs opacity-70">hasta 4 personas</p>
          </div>

          <p className="text-xs opacity-70">
            2 noches ·{' '}
            <strong style={{ color: 'var(--marca-acento)' }}>{plata(160000)}</strong>{' '}
            · seña {plata(80000)}
          </p>

          <button
            type="button"
            disabled
            className="w-full rounded-2xl bg-marca-principal px-4 py-2.5 text-sm font-semibold text-white"
          >
            Reservar
          </button>
        </div>
      </div>
    </div>
  );
}
