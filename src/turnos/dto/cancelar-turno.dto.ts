import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class CancelarTurnoDto {
  /**
   * Por qué se cancela. Obligatorio si cancela el salón (profesional o ADMIN);
   * opcional para el cliente. Le llega a la otra parte en el mail.
   * @example "El profesional no va a estar ese día"
   */
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres' })
  @IsString({ message: 'El motivo debe ser un texto' })
  @IsOptional()
  @Trim()
  motivo?: string;
}
