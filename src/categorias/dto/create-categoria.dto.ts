import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateCategoriaDto {
  /**
   * Nombre con el que el front agrupa los servicios. Único.
   * @example "Color"
   */
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @Trim()
  nombre: string;
}
