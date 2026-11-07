import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { IsFecha } from '../../common/fecha-hora';

// Query string of GET /reportes/rentabilidad. Decorators run bottom-up (see stopAtFirstError in main.ts).
export class RentabilidadQueryDto {
  /** Turnos desde ese día. @example "2026-11-01" */
  @IsFecha('desde')
  @IsNotEmpty({ message: 'desde es obligatorio' })
  desde: string;

  /** Turnos hasta ese día, incluido. @example "2026-11-30" */
  @IsFecha('hasta')
  @IsNotEmpty({ message: 'hasta es obligatorio' })
  hasta: string;

  /** Solo los servicios que hizo ese profesional. */
  @Min(1, { message: 'El legajo no es válido' })
  @IsInt({ message: 'El legajo debe ser un número' })
  @Type(() => Number)
  @IsOptional()
  legajo?: number;

  /** Solo ese servicio. */
  @Min(1, { message: 'El servicio no es válido' })
  @IsInt({ message: 'El servicio debe ser un id numérico' })
  @Type(() => Number)
  @IsOptional()
  servicioId?: number;
}
