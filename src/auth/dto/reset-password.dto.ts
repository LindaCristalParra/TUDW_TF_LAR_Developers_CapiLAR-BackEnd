import {
  IsHexadecimal,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsHexadecimal({ message: 'El token no es válido' })
  @Length(64, 64, { message: 'El token no es válido' })
  token: string;

  @IsString({ message: 'La contraseña debe ser un texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres',
  })
  contrasena: string;
}
