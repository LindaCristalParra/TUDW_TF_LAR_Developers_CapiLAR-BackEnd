import { ContextoDiagnostico } from './contexto';

// Free-text fields can carry personal data the staff typed in (decided 22/11): before the context
// goes to Gemini, the client's name and surname, and any email or phone-like number (hers or
// anyone's) are replaced with this.
export const DATO_OCULTO = '[dato oculto]';

/** The client's name, to find it in the free text. Never sent to Gemini. */
export interface DatosPersonales {
  nombre: string;
  apellido: string;
}

const VARIANTES: Record<string, string> = {
  a: 'aáàâä',
  e: 'eéèêë',
  i: 'iíìîï',
  o: 'oóòôö',
  u: 'uúùûü',
  n: 'nñ',
};

// Words of the name and surname (3+ letters), matching with or without accents and in any case.
function regexDeNombre(palabra: string): RegExp {
  const sinAcentos = palabra
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  const patron = [...sinAcentos]
    .map((c) =>
      VARIANTES[c]
        ? `[${VARIANTES[c]}]`
        : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`(?<![\\p{L}\\d])${patron}(?![\\p{L}\\d])`, 'giu');
}

const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.\p{L}{2,}/gu;
// Runs of digits with spaces, dashes, dots or parentheses, optionally after a "+" or a "(".
const POSIBLE_TELEFONO = /[+(]?\d[\d\s\-.()]{5,}\d/g;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
// 8 digits or more: a phone (Argentina, with or without area code). Shorter runs are quantities.
const MIN_DIGITOS_TELEFONO = 8;

/** The text with the client's personal data replaced by DATO_OCULTO. */
export function ocultarDatosPersonales(
  texto: string,
  datos: DatosPersonales,
): string {
  let limpio = texto.replace(EMAIL, DATO_OCULTO);
  limpio = limpio.replace(POSIBLE_TELEFONO, (encontrado) => {
    const digitos = encontrado.replace(/\D/g, '').length;
    return digitos >= MIN_DIGITOS_TELEFONO && !FECHA_ISO.test(encontrado.trim())
      ? DATO_OCULTO
      : encontrado;
  });
  const palabras = `${datos.nombre} ${datos.apellido}`
    .split(/[\s'-]+/)
    .filter((p) => p.length >= 3);
  for (const palabra of palabras) {
    limpio = limpio.replace(regexDeNombre(palabra), DATO_OCULTO);
  }
  return limpio;
}

/** The context with every free-text field cleaned. */
export function limpiarContexto(
  contexto: ContextoDiagnostico,
  datos: DatosPersonales,
): ContextoDiagnostico {
  const limpiar = (texto: string | null) =>
    texto === null ? null : ocultarDatosPersonales(texto, datos);
  return {
    ...contexto,
    fichaActual: {
      ...contexto.fichaActual,
      tratamientosPrevios: limpiar(contexto.fichaActual.tratamientosPrevios),
      observacionesInternas: limpiar(
        contexto.fichaActual.observacionesInternas,
      ),
    },
    // The "Otra" allergy is free text too.
    alergias: contexto.alergias.map((a) => ocultarDatosPersonales(a, datos)),
    fichasAnteriores: contexto.fichasAnteriores.map((f) => ({
      ...f,
      tratamientosPrevios: limpiar(f.tratamientosPrevios),
      observacionesInternas: limpiar(f.observacionesInternas),
      indicacionesCliente: limpiar(f.indicacionesCliente),
      formulas: f.formulas.map((formula) => ({
        ...formula,
        descripcion: limpiar(formula.descripcion),
      })),
    })),
  };
}
