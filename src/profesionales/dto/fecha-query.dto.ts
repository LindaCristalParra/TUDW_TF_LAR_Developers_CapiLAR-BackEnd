import { IsNotEmpty } from 'class-validator';
import { IsFecha } from '../../common/fecha-hora';

// Query string of DELETE /profesionales/:legajo/disponibilidad.
export class FechaQueryDto {
  /** @example "2026-10-14" */
  @IsFecha('La fecha')
  @IsNotEmpty({ message: 'La fecha es obligatoria' })
  fecha: string;
}
