import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class MotivoSerieDto {
  /**
   * Por qué se suspende o se da de baja. Opcional: queda como motivo de los turnos
   * cancelados y le llega a la clienta en el mail.
   * @example "Me voy de vacaciones"
   */
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres' })
  @IsString({ message: 'El motivo debe ser un texto' })
  @IsOptional()
  @Trim()
  motivo?: string;
}
