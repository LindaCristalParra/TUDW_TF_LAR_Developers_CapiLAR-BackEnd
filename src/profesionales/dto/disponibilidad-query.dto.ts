import { IsNotEmpty } from 'class-validator';
import { IsFecha } from '../../common/fecha-hora';

// Query string of GET /profesionales/:legajo/disponibilidad.
export class DisponibilidadQueryDto {
  /** @example "2026-10-13" */
  @IsFecha('desde')
  @IsNotEmpty({ message: 'desde es obligatorio' })
  desde: string;

  /** @example "2026-10-19" */
  @IsFecha('hasta')
  @IsNotEmpty({ message: 'hasta es obligatorio' })
  hasta: string;
}
