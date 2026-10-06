import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';
import { IsHora } from '../../common/fecha-hora';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateDisponibilidadDto {
  /**
   * Día de la semana: 0 = domingo, 1 = lunes ... 6 = sábado.
   * @example 1
   */
  @Max(6, { message: 'El día de la semana debe estar entre 0 y 6' })
  @Min(0, { message: 'El día de la semana debe estar entre 0 y 6' })
  @IsInt({ message: 'El día de la semana debe ser un número entero' })
  @IsNotEmpty({ message: 'El día de la semana es obligatorio' })
  diaSemana: number;

  /** @example "09:00" */
  @IsHora('El horario de inicio')
  @IsNotEmpty({ message: 'El horario de inicio es obligatorio' })
  horarioInicio: string;

  /** @example "13:00" */
  @IsHora('El horario de fin')
  @IsNotEmpty({ message: 'El horario de fin es obligatorio' })
  horarioFin: string;
}
