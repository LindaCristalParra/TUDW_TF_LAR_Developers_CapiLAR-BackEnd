import { IsHexadecimal, IsNotEmpty, Length } from 'class-validator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class VerificarEmailDto {
  /** Token del enlace del mail (64 caracteres hexadecimales). */
  @Length(64, 64, { message: 'El enlace no es válido' })
  @IsHexadecimal({ message: 'El enlace no es válido' })
  @IsNotEmpty({ message: 'El token es obligatorio' })
  token: string;
}
