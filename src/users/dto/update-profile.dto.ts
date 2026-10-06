import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

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

  /** @example "2994567890" */
  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres' })
  @IsString({ message: 'El teléfono debe ser un texto' })
  @IsNotEmpty({ message: 'El teléfono no puede estar vacío' })
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  telefono?: string;

  /**
   * Solo para CLIENTE. `""` o `null` la borra.
   * @example "Amoníaco"
   */
  @MaxLength(255, {
    message: 'La alergia no puede superar los 255 caracteres',
  })
  @IsString({ message: 'La alergia debe ser un texto' })
  @IsOptional()
  @Trim()
  alergia?: string | null;
}
