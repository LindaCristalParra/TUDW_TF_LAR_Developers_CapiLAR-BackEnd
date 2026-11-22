import {
  NivelCapilar,
  TipoDePelo,
  TipoProducto,
  UnidadInsumo,
  VolumenDePelo,
} from '../generated/prisma/client';

// What the AI gets about the client (decided 22/11): never her name, email or phone.

export interface DiagnosticoDeFicha {
  porosidad: NivelCapilar | null;
  elasticidad: NivelCapilar | null;
  porcentajeCanas: number | null;
  tipoDePelo: TipoDePelo | null;
  volumenDePelo: VolumenDePelo | null;
}

export interface FormulaDeFicha {
  descripcion: string | null;
  oxidanteVolumen: number | null;
  tiempoPoseMin: number | null;
  insumos: {
    producto: string;
    marca: string | null;
    tono: string | null;
    cantidad: number | null;
    unidad: UnidadInsumo | null;
  }[];
}

/** One of the client's previous closed records. */
export interface FichaAnterior extends DiagnosticoDeFicha {
  fecha: string;
  servicio: string;
  tratamientosPrevios: string | null;
  observacionesInternas: string | null;
  indicacionesCliente: string | null;
  formulas: FormulaDeFicha[];
}

/** An item the salon has in stock for its own use; the suggested formula can only use these. */
export interface ArticuloDisponible {
  id: number;
  nombre: string;
  // "Brand Line", as the record stores it.
  marca: string;
  tonalidad: string | null;
  tipoProducto: TipoProducto;
  unidad: UnidadInsumo;
}

export interface ContextoDiagnostico {
  // The record being filled in.
  fichaActual: DiagnosticoDeFicha & {
    fecha: string;
    servicio: string;
    tratamientosPrevios: string | null;
    observacionesInternas: string | null;
  };
  alergias: string[];
  // Up to MAX_FICHAS_ANTERIORES, newest first.
  fichasAnteriores: FichaAnterior[];
  articulos: ArticuloDisponible[];
}

export const MAX_FICHAS_ANTERIORES = 5;
// Enough for a salon's catalog; keeps the prompt (and the answer time) bounded.
export const MAX_ARTICULOS = 300;
