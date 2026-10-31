import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

// Query string of GET /profesionales.
export class ListProfesionalesQueryDto {
  /** Solo los profesionales que hacen este servicio. */
  @Min(1, { message: 'El servicio no es válido' })
  @IsInt({ message: 'El servicio debe ser un número' })
  @Type(() => Number)
  @IsOptional()
  servicioId?: number;
}
