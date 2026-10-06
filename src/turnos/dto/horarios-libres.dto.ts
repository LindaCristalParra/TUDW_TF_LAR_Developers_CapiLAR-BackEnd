import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { IsFecha } from '../../common/fecha-hora';
import { TurnoItemDto } from './turno-item.dto';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class HorariosLibresDto {
  /** @example "2026-10-07" */
  @IsFecha('La fecha')
  @IsNotEmpty({ message: 'La fecha es obligatoria' })
  fecha: string;

  /** Servicios en el orden en que se hacen, cada uno con su profesional. */
  @ValidateNested({ each: true })
  @Type(() => TurnoItemDto)
  @ArrayMaxSize(10, { message: 'Un turno puede tener hasta 10 servicios' })
  @ArrayMinSize(1, { message: 'Elegí al menos un servicio' })
  @IsArray({ message: 'Los servicios deben ser una lista' })
  items: TurnoItemDto[];
}
