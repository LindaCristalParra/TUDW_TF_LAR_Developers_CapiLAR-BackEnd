import { IsArray, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { IsFecha, IsHora } from '../../common/fecha-hora';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class ReprogramarTurnoDto {
  /** @example "2026-10-09" */
  @IsFecha('La fecha')
  @IsNotEmpty({ message: 'La fecha es obligatoria' })
  fecha: string;

  /** @example "15:00" */
  @IsHora('La hora de inicio')
  @IsNotEmpty({ message: 'La hora de inicio es obligatoria' })
  horaInicio: string;

  /**
   * Opcional: legajo del profesional de cada servicio, en el mismo orden que
   * los servicios del turno. Si no se manda, siguen los mismos profesionales.
   * @example [1, 2]
   */
  @Min(1, { each: true, message: 'Los legajos no son válidos' })
  @IsInt({ each: true, message: 'Los legajos deben ser números' })
  @IsArray({ message: 'Los profesionales deben ser una lista de legajos' })
  @IsOptional()
  profesionales?: number[];
}
