import {
  IsHexadecimal,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class ResetPasswordDto {
  /** Token del enlace del mail (64 caracteres hexadecimales). */
  @Length(64, 64, { message: 'El token no es válido' })
  @IsHexadecimal({ message: 'El token no es válido' })
  @IsNotEmpty({ message: 'El token es obligatorio' })
  token: string;

  /**
   * Contraseña nueva, entre 8 y 72 caracteres.
   * @example "NuevaClave1234"
   */
  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres',
  })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @IsString({ message: 'La contraseña debe ser un texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  contrasena: string;
}
