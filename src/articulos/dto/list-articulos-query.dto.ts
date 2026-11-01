import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import { TipoProducto, UsoArticulo } from '../../generated/prisma/client';

const aBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

// Query string of GET /articulos. Decorators run bottom-up (see stopAtFirstError in main.ts).
export class ListArticulosQueryDto {
  /**
   * Busca en el nombre y el código. No distingue mayúsculas ni tildes.
   * @example "argan"
   */
  @MaxLength(100, {
    message: 'La búsqueda no puede superar los 100 caracteres',
  })
  @IsString({ message: 'La búsqueda debe ser un texto' })
  @IsOptional()
  @Trim()
  search?: string;

  /** Solo los de esa marca. */
  @Min(1, { message: 'La marca no es válida' })
  @IsInt({ message: 'La marca debe ser un id numérico' })
  @Type(() => Number)
  @IsOptional()
  marcaId?: number;

  @IsEnum(TipoProducto, { message: 'El tipo de producto no es válido' })
  @IsOptional()
  tipoProducto?: TipoProducto;

  /**
   * SALON trae también los AMBOS (es lo que usa el selector de la ficha); VENTA,
   * también. AMBOS trae solo esos.
   */
  @IsEnum(UsoArticulo, { message: 'El uso debe ser SALON, VENTA o AMBOS' })
  @IsOptional()
  uso?: UsoArticulo;

  /** `true`: solo los que están en el mínimo o debajo. `false`: los que no. */
  @IsBoolean({ message: 'bajoStock debe ser true o false' })
  @IsOptional()
  @Transform(aBoolean)
  bajoStock?: boolean;

  /** `true` incluye los dados de baja (por defecto se ocultan). */
  @IsBoolean({ message: 'incluirBajas debe ser true o false' })
  @IsOptional()
  @Transform(aBoolean)
  incluirBajas?: boolean;
}
