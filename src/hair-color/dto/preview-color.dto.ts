import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

// Text fields of the same multipart form as the photo (they arrive as strings).
// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class PreviewColorDto {
  /**
   * Color de la carta en hexadecimal.
   * @example "#8B6542"
   */
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'El color debe ser un hexadecimal como #8B6542',
  })
  @IsString({ message: 'El color debe ser un texto' })
  @IsNotEmpty({ message: 'Elegí un color (color)' })
  color: string;

  /**
   * Intensidad del color, de 0 a 100. Por defecto, 80.
   * @example 80
   */
  @Max(100, { message: 'La intensidad va de 0 a 100' })
  @Min(0, { message: 'La intensidad va de 0 a 100' })
  @IsInt({ message: 'La intensidad debe ser un número entero' })
  @Type(() => Number)
  @IsOptional()
  intensidad?: number;
}

// Response of POST /hair-color/preview.
export class VistaPreviaColorDto {
  /** Link a la imagen con el color aplicado (en modo simulado, la misma selfie como data URL). */
  url: string;

  /**
   * Hasta cuándo sirve el link (YouCam lo guarda 2 horas).
   * @example "2026-10-28T20:30:00.000Z"
   */
  venceEn: string;

  /** true si no se llamó a YouCam (YOUCAM_MODO=simulado). */
  simulado: boolean;
}
