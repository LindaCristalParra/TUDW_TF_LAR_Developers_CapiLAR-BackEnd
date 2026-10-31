import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateAlergiaDto {
  /**
   * Nombre que ve el cliente al elegirla. Único.
   * @example "Látex"
   */
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @Trim()
  nombre: string;

  /**
   * Opcional, una aclaración corta. `""` o `null` la borra.
   * @example "Guantes y algunos productos."
   */
  @MaxLength(255, {
    message: 'La descripción no puede superar los 255 caracteres',
  })
  @IsString({ message: 'La descripción debe ser un texto' })
  @IsOptional()
  @Trim()
  descripcion?: string | null;
}
