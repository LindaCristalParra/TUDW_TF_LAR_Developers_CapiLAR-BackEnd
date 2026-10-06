import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import { IsFechaHora } from '../../common/fecha-hora';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateBloqueoDto {
  /**
   * Inicio del bloqueo, hora local del salón.
   * @example "2026-10-10T09:00"
   */
  @IsFechaHora('La fecha de inicio')
  @IsNotEmpty({ message: 'La fecha de inicio es obligatoria' })
  fechaInicio: string;

  /**
   * Fin del bloqueo, hora local del salón.
   * @example "2026-10-10T13:00"
   */
  @IsFechaHora('La fecha de fin')
  @IsNotEmpty({ message: 'La fecha de fin es obligatoria' })
  fechaFin: string;

  /** @example "Turno médico" */
  @MaxLength(255, { message: 'El motivo no puede superar los 255 caracteres' })
  @IsString({ message: 'El motivo debe ser un texto' })
  @IsOptional()
  @Trim()
  motivo?: string;
}
