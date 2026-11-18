import { Marca } from '../generated/prisma/client';

// "No line" is stored as '' (so the unique index stops a repeated brand without a line), but the
// API keeps it as null, like the other optional fields.
export type MarcaApi = Omit<Marca, 'linea'> & { linea: string | null };

export function marcaParaApi(marca: Marca): MarcaApi {
  return { ...marca, linea: marca.linea || null };
}

/** null, undefined or "" from the API -> '' for the column. */
export function lineaParaBase(linea?: string | null): string {
  return linea || '';
}
