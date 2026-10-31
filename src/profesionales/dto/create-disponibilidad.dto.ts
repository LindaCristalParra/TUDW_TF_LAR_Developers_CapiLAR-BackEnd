import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import { IsFecha, IsHora } from '../../common/fecha-hora';

export const MAX_FECHAS_POR_CARGA = 31;

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateDisponibilidadDto {
  /**
   * Fechas en las que se trabaja en ese horario (se guardan todas o ninguna).
   * @example ["2026-10-14", "2026-10-15"]
   */
  @IsFecha('Las fechas', true)
  @ArrayUnique({ message: 'Las fechas no se pueden repetir' })
  @ArrayMaxSize(MAX_FECHAS_POR_CARGA, {
    message: `Se pueden cargar hasta ${MAX_FECHAS_POR_CARGA} fechas por vez`,
  })
  @ArrayMinSize(1, { message: 'Elegí al menos una fecha' })
  @IsArray({ message: 'Las fechas deben ser una lista' })
  fechas: string[];

  /** @example "09:00" */
  @IsHora('El horario de inicio')
  @IsNotEmpty({ message: 'El horario de inicio es obligatorio' })
  horarioInicio: string;

  /** @example "18:00" */
  @IsHora('El horario de fin')
  @IsNotEmpty({ message: 'El horario de fin es obligatorio' })
  horarioFin: string;
}
