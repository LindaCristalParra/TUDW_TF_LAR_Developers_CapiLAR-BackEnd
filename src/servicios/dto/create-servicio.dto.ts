import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import {
  MAX_DURACION_TURNO,
  MIN_DURACION_SERVICIO,
} from '../../common/reglas-agenda';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateServicioDto {
  /**
   * Nombre del servicio.
   * @example "Corte"
   */
  @MaxLength(100, { message: 'El tipo no puede superar los 100 caracteres' })
  @IsString({ message: 'El tipo debe ser un texto' })
  @IsNotEmpty({ message: 'El tipo es obligatorio' })
  @Trim()
  tipo: string;

  /**
   * Opcional, para las tarjetas de servicios. `""` o `null` la borra.
   * @example "Corte con lavado y secado."
   */
  @MaxLength(500, {
    message: 'La descripción no puede superar los 500 caracteres',
  })
  @IsString({ message: 'La descripción debe ser un texto' })
  @IsOptional()
  @Trim()
  descripcion?: string | null;

  /**
   * Duración en minutos: de 15 (un diagnóstico) a 420 (7 horas, el máximo de un turno).
   * @example 45
   */
  @Max(MAX_DURACION_TURNO, {
    message: 'La duración no puede superar las 7 horas',
  })
  @Min(MIN_DURACION_SERVICIO, {
    message: 'La duración debe ser de al menos 15 minutos',
  })
  @IsInt({ message: 'La duración debe ser un número entero de minutos' })
  @IsNotEmpty({ message: 'La duración es obligatoria' })
  tiempoDuracion: number;

  /**
   * Precio en pesos.
   * @example 15000
   */
  @Min(0, { message: 'El precio no puede ser negativo' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número con hasta 2 decimales' },
  )
  @IsNotEmpty({ message: 'El precio es obligatorio' })
  precio: number;
}
