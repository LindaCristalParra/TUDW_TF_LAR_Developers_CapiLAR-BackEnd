import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { HasLetterAndNumber } from './has-letter-and-number.decorator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class ChangePasswordDto {
  /**
   * Contraseña actual.
   * @example "Clave1234"
   */
  @IsString({ message: 'La contraseña actual debe ser un texto' })
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
  actual: string;

  /**
   * Contraseña nueva, entre 8 y 72 caracteres, con al menos una letra y un número.
   * @example "NuevaClave1234"
   */
  @HasLetterAndNumber()
  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres',
  })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @IsString({ message: 'La contraseña debe ser un texto' })
  @IsNotEmpty({ message: 'La contraseña nueva es obligatoria' })
  nueva: string;
}
