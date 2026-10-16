import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import { UnidadInsumo } from '../../generated/prisma/client';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class FormulaInsumoDto {
  /** @example "Tintura" */
  @MaxLength(100, {
    message: 'El producto no puede superar los 100 caracteres',
  })
  @IsString({ message: 'El producto debe ser un texto' })
  @IsNotEmpty({ message: 'El producto es obligatorio' })
  @Trim()
  producto: string;

  /** @example "Koleston" */
  @MaxLength(100, { message: 'La marca no puede superar los 100 caracteres' })
  @IsString({ message: 'La marca debe ser un texto' })
  @IsOptional()
  @Trim()
  marca?: string | null;

  /** @example "7.1" */
  @MaxLength(50, { message: 'El tono no puede superar los 50 caracteres' })
  @IsString({ message: 'El tono debe ser un texto' })
  @IsOptional()
  @Trim()
  tono?: string | null;

  /** @example 30 */
  @IsPositive({ message: 'La cantidad tiene que ser mayor a 0' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'La cantidad debe ser un número con hasta 2 decimales' },
  )
  @IsOptional()
  cantidad?: number | null;

  /** @example "G" */
  @IsEnum(UnidadInsumo, { message: 'La unidad debe ser G, ML o UNIDAD' })
  @IsOptional()
  unidad?: UnidadInsumo | null;

  /** Artículo del inventario (F11), opcional. */
  @Min(1, { message: 'El artículo no es válido' })
  @IsInt({ message: 'El artículo debe ser un número' })
  @IsOptional()
  articuloId?: number | null;
}

export class FormulaDto {
  /** @example "Raíz" */
  @MaxLength(500, {
    message: 'La descripción de la fórmula no puede superar los 500 caracteres',
  })
  @IsString({ message: 'La descripción de la fórmula debe ser un texto' })
  @IsOptional()
  @Trim()
  descripcion?: string | null;

  /** Volumen del oxidante. @example 20 */
  @Max(60, { message: 'El volumen del oxidante no puede superar 60' })
  @Min(1, { message: 'El volumen del oxidante tiene que ser mayor a 0' })
  @IsInt({ message: 'El volumen del oxidante debe ser un número entero' })
  @IsOptional()
  oxidanteVolumen?: number | null;

  /** Tiempo de pose en minutos. @example 35 */
  @Max(240, { message: 'El tiempo de pose no puede superar las 4 horas' })
  @Min(1, { message: 'El tiempo de pose tiene que ser mayor a 0' })
  @IsInt({ message: 'El tiempo de pose debe ser un número entero de minutos' })
  @IsOptional()
  tiempoPoseMin?: number | null;

  /** Productos de la mezcla. */
  @ValidateNested({ each: true })
  @Type(() => FormulaInsumoDto)
  @ArrayMaxSize(20, { message: 'Una fórmula puede tener hasta 20 insumos' })
  @IsArray({ message: 'Los insumos deben ser una lista' })
  @IsOptional()
  insumos?: FormulaInsumoDto[];
}
