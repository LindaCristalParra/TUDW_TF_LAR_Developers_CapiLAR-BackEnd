import { OmitType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { IsHora } from '../../common/fecha-hora';
import { MetodoPago } from '../../generated/prisma/client';
import { HorariosLibresDto } from './horarios-libres.dto';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
// turnoId is only for checking free times while rescheduling.
export class CreateTurnoDto extends OmitType(HorariosLibresDto, ['turnoId']) {
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
}
