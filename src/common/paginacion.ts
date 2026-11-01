import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const POR_PAGINA = 50;
const MAX_POR_PAGINA = 200;
// Without a cap a huge page (e.g. 1e20) makes a skip Prisma rejects (a 500). A million pages of
// 200 is far beyond any list here.
const MAX_PAGINA = 1_000_000;

// Query string of a paginated list (?pagina=2&porPagina=50); extend it to add filters.
// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class PaginacionQueryDto {
  /** Desde 1. Por defecto 1, máximo 1.000.000. */
  @Max(MAX_PAGINA, { message: 'La página no puede ser mayor a 1.000.000' })
  @Min(1, { message: 'La página debe ser 1 o más' })
  @IsInt({ message: 'La página debe ser un número entero' })
  @Type(() => Number)
  @IsOptional()
  pagina?: number;

  /** Por defecto 50, máximo 200. */
  @Max(MAX_POR_PAGINA, {
    message: `No se pueden pedir más de ${MAX_POR_PAGINA} por página`,
  })
  @Min(1, { message: 'porPagina debe ser 1 o más' })
  @IsInt({ message: 'porPagina debe ser un número entero' })
  @Type(() => Number)
  @IsOptional()
  porPagina?: number;
}

export interface Pagina<T> {
  items: T[];
  // All the rows, across pages: the front gets the page count from it.
  total: number;
  pagina: number;
  porPagina: number;
}

/** pagina/porPagina (with their defaults) and the skip/take for Prisma. */
export function paginar(query: PaginacionQueryDto) {
  const pagina = query.pagina ?? 1;
  const porPagina = query.porPagina ?? POR_PAGINA;
  return { pagina, porPagina, skip: (pagina - 1) * porPagina, take: porPagina };
}
