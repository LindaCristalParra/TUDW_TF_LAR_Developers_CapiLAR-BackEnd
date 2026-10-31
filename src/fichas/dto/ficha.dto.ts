import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import {
  NivelCapilar,
  TipoDePelo,
  VolumenDePelo,
} from '../../generated/prisma/client';
import { FormulaDto } from './formula.dto';

// Every field is optional: the record is filled in during the service. In a PATCH, null clears a field.
// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class FichaDto {
  /** @example "MEDIA" */
  @IsEnum(NivelCapilar, {
    message: 'La porosidad debe ser BAJA, MEDIA o ALTA',
  })
  @IsOptional()
  porosidad?: NivelCapilar | null;

  /** @example "ALTA" */
  @IsEnum(NivelCapilar, {
    message: 'La elasticidad debe ser BAJA, MEDIA o ALTA',
  })
  @IsOptional()
  elasticidad?: NivelCapilar | null;

  /**
   * Porcentaje de canas, de 0 a 100.
   * @example 30
   */
  @Max(100, { message: 'El porcentaje de canas no puede superar 100' })
  @Min(0, { message: 'El porcentaje de canas no puede ser negativo' })
  @IsInt({ message: 'El porcentaje de canas debe ser un número entero' })
  @IsOptional()
  porcentajeCanas?: number | null;

  /** @example "ONDULADO" */
  @IsEnum(TipoDePelo, {
    message: 'El tipo de pelo debe ser LISO, ONDULADO, RIZADO o AFRO',
  })
  @IsOptional()
  tipoDePelo?: TipoDePelo | null;

  /** @example "MEDIO" */
  @IsEnum(VolumenDePelo, {
    message: 'El volumen de pelo debe ser FINO, MEDIO o GRUESO',
  })
  @IsOptional()
  volumenDePelo?: VolumenDePelo | null;

  /** @example "Decoloración hace 6 meses" */
  @MaxLength(1000, {
    message: 'Los tratamientos previos no pueden superar los 1000 caracteres',
  })
  @IsString({ message: 'Los tratamientos previos deben ser un texto' })
  @IsOptional()
  @Trim()
  tratamientosPrevios?: string | null;

  /**
   * Solo para el salón.
   * @example "Cuero cabelludo sensible"
   */
  @MaxLength(1000, {
    message: 'Las observaciones no pueden superar los 1000 caracteres',
  })
  @IsString({ message: 'Las observaciones deben ser un texto' })
  @IsOptional()
  @Trim()
  observacionesInternas?: string | null;

  /**
   * Cuidados para la clienta.
   * @example "Shampoo sin sulfatos por 15 días"
   */
  @MaxLength(1000, {
    message: 'Las indicaciones no pueden superar los 1000 caracteres',
  })
  @IsString({ message: 'Las indicaciones deben ser un texto' })
  @IsOptional()
  @Trim()
  indicacionesCliente?: string | null;

  /**
   * Fórmulas en el orden en que se aplicaron. En un PATCH, si se manda, reemplaza
   * todas las anteriores (`[]` las borra); si no se manda, quedan como están.
   */
  @ValidateNested({ each: true })
  @Type(() => FormulaDto)
  @ArrayMaxSize(10, { message: 'Una ficha puede tener hasta 10 fórmulas' })
  @IsArray({ message: 'Las fórmulas deben ser una lista' })
  @IsOptional()
  formulas?: FormulaDto[];
}
