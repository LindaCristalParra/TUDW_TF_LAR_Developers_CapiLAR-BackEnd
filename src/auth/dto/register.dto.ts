import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_ALERGIAS } from '../../alergias/alergias-de-cliente';
import { IsFecha } from '../../common/fecha-hora';
import { HasLetterAndNumber } from './has-letter-and-number.decorator';
import { Trim } from './trim.decorator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class RegisterDto {
  /** @example "Martina" */
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @Trim()
  nombre: string;

  /** @example "Zárate" */
  @MaxLength(100, {
    message: 'El apellido no puede superar los 100 caracteres',
  })
  @IsString({ message: 'El apellido debe ser un texto' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @Trim()
  apellido: string;

  /** @example "martina.zarate@gmail.com" */
  @IsEmail({}, { message: 'El email no es válido' })
  @IsNotEmpty({ message: 'El email es obligatorio' })
  @Trim()
  email: string;

  /**
   * Solo números, de 10 a 13 dígitos (sin espacios, guiones ni "+").
   * @example "2994567890"
   */
  @Matches(/^\d{10,13}$/, {
    message:
      'El teléfono debe tener entre 10 y 13 números, sin espacios ni guiones',
  })
  @IsString({ message: 'El teléfono debe ser un texto' })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @Trim()
  telefono: string;

  /**
   * Opcional. `id` de las alergias elegidas de `GET /alergias`.
   * @example [2, 5]
   */
  @IsInt({ each: true, message: 'Cada alergia debe ser un id numérico' })
  @ArrayMaxSize(MAX_ALERGIAS, {
    message: `No se pueden elegir más de ${MAX_ALERGIAS} alergias`,
  })
  @IsArray({ message: 'alergiaIds debe ser una lista' })
  @IsOptional()
  alergiaIds?: number[];

  /**
   * "Otra": alergias o sensibilidades que no están en la lista (texto libre).
   * @example "Aceite de coco"
   */
  @MaxLength(255, {
    message: 'La alergia no puede superar los 255 caracteres',
  })
  @IsString({ message: 'La alergia debe ser un texto' })
  @IsOptional()
  @Trim()
  alergia?: string;

  /**
   * Opcional. Fecha pasada, desde 1900.
   * @example "1995-04-23"
   */
  @IsFecha('La fecha de nacimiento')
  @IsOptional()
  fechaNacimiento?: string;

  /**
   * Entre 8 y 72 caracteres, con al menos una letra y un número.
   * @example "Clave1234"
   */
  @HasLetterAndNumber()
  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres',
  })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @IsString({ message: 'La contraseña debe ser un texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  contrasena: string;
}
