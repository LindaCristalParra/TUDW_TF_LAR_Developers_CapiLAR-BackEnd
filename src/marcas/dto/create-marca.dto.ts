import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateMarcaDto {
  /** @example "Fidelité" */
  @MaxLength(100, {
    message: 'La razón social no puede superar los 100 caracteres',
  })
  @IsString({ message: 'La razón social debe ser un texto' })
  @IsNotEmpty({ message: 'La razón social es obligatoria' })
  @Trim()
  razonSocial: string;

  /**
   * Línea de productos, opcional. `""` o `null` la borra.
   * @example "Argán"
   */
  @MaxLength(100, { message: 'La línea no puede superar los 100 caracteres' })
  @IsString({ message: 'La línea debe ser un texto' })
  @IsOptional()
  @Trim()
  linea?: string | null;
}
