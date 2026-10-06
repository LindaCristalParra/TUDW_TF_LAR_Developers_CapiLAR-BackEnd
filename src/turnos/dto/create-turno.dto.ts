import { IsEnum, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { IsHora } from '../../common/fecha-hora';
import { MetodoPago } from '../../generated/prisma/client';
import { HorariosLibresDto } from './horarios-libres.dto';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class CreateTurnoDto extends HorariosLibresDto {
  /** @example "10:00" */
  @IsHora('La hora de inicio')
  @IsNotEmpty({ message: 'La hora de inicio es obligatoria' })
  horaInicio: string;

  /** Opcional: se puede completar al cobrar. */
  @IsEnum(MetodoPago, {
    message:
      'El método de pago debe ser EFECTIVO, DEBITO, CREDITO o TRANSFERENCIA',
  })
  @IsOptional()
  metodoPago?: MetodoPago;

  /**
   * Solo para PROFESIONAL o ADMIN que cargan un turno a nombre de un cliente
   * (el turno nace CONFIRMADO). Un CLIENTE no lo manda: reserva para sí.
   * @example 4
   */
  @Min(1, { message: 'El cliente no es válido' })
  @IsInt({ message: 'El cliente debe ser un número' })
  @IsOptional()
  clienteId?: number;
}
