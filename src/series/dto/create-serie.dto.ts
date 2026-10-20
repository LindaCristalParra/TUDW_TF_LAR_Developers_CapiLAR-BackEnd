import { IsEnum, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { IsFecha } from '../../common/fecha-hora';
import { FrecuenciaSerie } from '../../generated/prisma/client';

// Same body for the preview and for creating the series.
// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class CreateSerieDto {
  /**
   * Turno CONFIRMADO o COMPLETADO del que sale la serie: se repite su fecha y hora cada tanto.
   * @example 15
   */
  @Min(1, { message: 'El turno no es válido' })
  @IsInt({ message: 'El turno debe ser un número' })
  @IsNotEmpty({ message: 'Indicá el turno (turnoId)' })
  turnoId: number;

  /**
   * Servicio del turno que se repite (id de `detalles[]`). Obligatorio solo si el
   * turno tiene más de un servicio tuyo.
   * @example 21
   */
  @Min(1, { message: 'El servicio del turno no es válido' })
  @IsInt({ message: 'El servicio del turno debe ser un número' })
  @IsOptional()
  turnoDetalleId?: number;

  /**
   * SEMANAL (7 días), QUINCENAL (14), CADA_20_DIAS (20) o MENSUAL (cada 4 semanas).
   * @example "SEMANAL"
   */
  @IsEnum(FrecuenciaSerie, {
    message:
      'La frecuencia debe ser SEMANAL, QUINCENAL, CADA_20_DIAS o MENSUAL',
  })
  @IsNotEmpty({ message: 'La frecuencia es obligatoria' })
  frecuencia: FrecuenciaSerie;

  /**
   * Última fecha posible de la serie (hasta 60 días desde hoy).
   * @example "2026-12-15"
   */
  @IsFecha('La fecha de fin')
  @IsNotEmpty({ message: 'La fecha de fin es obligatoria' })
  fechaFin: string;
}
