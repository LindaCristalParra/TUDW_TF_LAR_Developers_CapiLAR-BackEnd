import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
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

  /**
   * Solo PROFESIONAL o ADMIN, al reprogramar: el horario actual de ese turno
   * cuenta como libre y se tienen en cuenta los otros turnos de su cliente.
   * @example 12
   */
  @Min(1, { message: 'El turno no es válido' })
  @IsInt({ message: 'El turno debe ser un número' })
  @IsOptional()
  turnoId?: number;

  /**
   * Solo PROFESIONAL o ADMIN: el cliente para quien se carga el turno (un
   * CLIENTE no lo manda, reserva para sí). Se tienen en cuenta sus otros turnos.
   * Al crear, el turno nace CONFIRMADO a su nombre. En horarios libres no se
   * manda junto con `turnoId`.
   * @example 4
   */
  @Min(1, { message: 'El cliente no es válido' })
  @IsInt({ message: 'El cliente debe ser un número' })
  @IsOptional()
  clienteId?: number;
}
