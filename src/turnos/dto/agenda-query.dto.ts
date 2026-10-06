import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { IsFecha } from '../../common/fecha-hora';

// Query string of GET /turnos/agenda. A day or a week is just a date range.
export class AgendaQueryDto {
  /** @example "2026-10-06" */
  @IsFecha('desde')
  @IsNotEmpty({ message: 'desde es obligatorio' })
  desde: string;

  /** @example "2026-10-12" */
  @IsFecha('hasta')
  @IsNotEmpty({ message: 'hasta es obligatorio' })
  hasta: string;

  /** Solo ADMIN: agenda de un profesional. Sin legajo, el ADMIN ve todos los turnos. */
  @Min(1, { message: 'El legajo no es válido' })
  @IsInt({ message: 'El legajo debe ser un número' })
  @Type(() => Number)
  @IsOptional()
  legajo?: number;
}
