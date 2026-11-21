import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

// Query string of GET /servicios and GET /servicios/todos.
export class ListServiciosQueryDto {
  /** Solo los servicios de esta categoría. */
  @Min(1, { message: 'La categoría no es válida' })
  @IsInt({ message: 'La categoría debe ser un número' })
  @Type(() => Number)
  @IsOptional()
  categoriaId?: number;
}
