import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from './trim.decorator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class RegisterDto {
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @Trim()
  nombre: string;

  @MaxLength(100, {
    message: 'El apellido no puede superar los 100 caracteres',
  })
  @IsString({ message: 'El apellido debe ser un texto' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @Trim()
  apellido: string;

  @IsEmail({}, { message: 'El email no es válido' })
  @IsNotEmpty({ message: 'El email es obligatorio' })
  @Trim()
  email: string;

  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres' })
  @IsString({ message: 'El teléfono debe ser un texto' })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @Trim()
  telefono: string;

  @MaxLength(255, {
    message: 'La alergia no puede superar los 255 caracteres',
  })
  @IsString({ message: 'La alergia debe ser un texto' })
  @IsOptional()
  @Trim()
  alergia?: string;

  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres',
  })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @IsString({ message: 'La contraseña debe ser un texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  contrasena: string;
}
