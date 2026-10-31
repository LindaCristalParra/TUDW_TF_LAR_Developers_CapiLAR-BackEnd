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
  ValidateIf,
} from 'class-validator';
import { MAX_ALERGIAS } from '../../alergias/alergias-de-cliente';
import { Trim } from '../../auth/dto/trim.decorator';
import { IsFecha } from '../../common/fecha-hora';

export class UpdateProfileDto {
  /** @example "Martina" */
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  nombre?: string;

  /** @example "Zárate" */
  @MaxLength(100, {
    message: 'El apellido no puede superar los 100 caracteres',
  })
  @IsString({ message: 'El apellido debe ser un texto' })
  @IsNotEmpty({ message: 'El apellido no puede estar vacío' })
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  apellido?: string;

  /** @example "martina.zarate@gmail.com" */
  @IsEmail({}, { message: 'El email no es válido' })
  @IsNotEmpty({ message: 'El email no puede estar vacío' })
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  email?: string;

  /**
   * Solo números, de 10 a 13 dígitos (sin espacios, guiones ni "+").
   * @example "2994567890"
   */
  @Matches(/^\d{10,13}$/, {
    message:
      'El teléfono debe tener entre 10 y 13 números, sin espacios ni guiones',
  })
  @IsString({ message: 'El teléfono debe ser un texto' })
  @IsNotEmpty({ message: 'El teléfono no puede estar vacío' })
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  telefono?: string;

  /**
   * Solo para CLIENTE. `id` de las alergias de `GET /alergias`: reemplaza la lista
   * entera (`[]` las quita todas). Se pueden reenviar las que ya tiene aunque estén dadas de baja.
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
   * Solo para CLIENTE. "Otra": lo que no está en la lista. `""` o `null` la borra.
   * @example "Aceite de coco"
   */
  @MaxLength(255, {
    message: 'La alergia no puede superar los 255 caracteres',
  })
  @IsString({ message: 'La alergia debe ser un texto' })
  @IsOptional()
  @Trim()
  alergia?: string | null;

  /**
   * Fecha pasada, desde 1900. `null` la borra.
   * @example "1995-04-23"
   */
  @IsFecha('La fecha de nacimiento')
  @IsOptional()
  fechaNacimiento?: string | null;
}
