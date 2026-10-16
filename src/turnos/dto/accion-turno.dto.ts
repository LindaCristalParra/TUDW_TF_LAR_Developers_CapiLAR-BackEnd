import { IsHexadecimal, IsNotEmpty, Length } from 'class-validator';
import { CancelarTurnoDto } from './cancelar-turno.dto';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class AccionTurnoDto {
  /** Token del enlace del recordatorio (64 caracteres hexadecimales). */
  @Length(64, 64, { message: 'El enlace no es válido' })
  @IsHexadecimal({ message: 'El enlace no es válido' })
  @IsNotEmpty({ message: 'El token es obligatorio' })
  token: string;
}

export class CancelarPorTokenDto extends CancelarTurnoDto {
  /** Token del enlace del recordatorio (64 caracteres hexadecimales). */
  @Length(64, 64, { message: 'El enlace no es válido' })
  @IsHexadecimal({ message: 'El enlace no es válido' })
  @IsNotEmpty({ message: 'El token es obligatorio' })
  token: string;
}
