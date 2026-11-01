import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import { IsFecha } from '../../common/fecha-hora';
import {
  TipoDeposito,
  TipoProducto,
  UnidadInsumo,
  UsoArticulo,
} from '../../generated/prisma/client';

const DOS_DECIMALES = { maxDecimalPlaces: 2 };
const TRES_DECIMALES = { maxDecimalPlaces: 3 };

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateArticuloDto {
  /** @example "Mythical Shampoo Argán" */
  @MaxLength(150, { message: 'El nombre no puede superar los 150 caracteres' })
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @Trim()
  nombre: string;

  /**
   * Código del artículo en la lista del proveedor, opcional. `""` o `null` lo borra.
   * @example "714"
   */
  @MaxLength(30, { message: 'El código no puede superar los 30 caracteres' })
  @IsString({ message: 'El código debe ser un texto' })
  @IsOptional()
  @Trim()
  codigo?: string | null;

  /**
   * SALON: se usa en los servicios. VENTA: se vende. AMBOS: las dos cosas, con un solo stock.
   * @example "VENTA"
   */
  @IsEnum(UsoArticulo, { message: 'El uso debe ser SALON, VENTA o AMBOS' })
  @IsNotEmpty({ message: 'El uso es obligatorio' })
  uso: UsoArticulo;

  /** @example "SHAMPOO" */
  @IsEnum(TipoProducto, { message: 'El tipo de producto no es válido' })
  @IsNotEmpty({ message: 'El tipo de producto es obligatorio' })
  tipoProducto: TipoProducto;

  /** @example 1 */
  @Min(1, { message: 'La marca no es válida' })
  @IsInt({ message: 'La marca debe ser un id numérico' })
  @IsNotEmpty({ message: 'La marca es obligatoria' })
  marcaId: number;

  /**
   * Lo que paga el salón por un envase, en pesos.
   * @example 12500
   */
  @Min(0, { message: 'El precio de costo no puede ser negativo' })
  @IsNumber(DOS_DECIMALES, {
    message: 'El precio de costo debe ser un número con hasta 2 decimales',
  })
  @IsNotEmpty({ message: 'El precio de costo es obligatorio' })
  precioCosto: number;

  /**
   * Precio de venta de un envase, opcional (para los de uso VENTA o AMBOS). `null` lo borra.
   * @example 18000
   */
  @Min(0, { message: 'El precio de venta no puede ser negativo' })
  @IsNumber(DOS_DECIMALES, {
    message: 'El precio de venta debe ser un número con hasta 2 decimales',
  })
  @IsOptional()
  precioVenta?: number | null;

  /**
   * Contenido de un envase, en `tipoPeso`.
   * @example 260
   */
  @IsPositive({ message: 'El contenido del envase debe ser mayor a 0' })
  @IsNumber(DOS_DECIMALES, {
    message: 'El contenido del envase debe ser un número con hasta 2 decimales',
  })
  @IsNotEmpty({ message: 'El contenido del envase es obligatorio' })
  pesoInicial: number;

  /**
   * Unidad del contenido: la misma que usan los insumos de la ficha.
   * @example "ML"
   */
  @IsEnum(UnidadInsumo, { message: 'La unidad debe ser G, ML o UNIDAD' })
  @IsNotEmpty({ message: 'La unidad es obligatoria' })
  tipoPeso: UnidadInsumo;

  /**
   * Tono, para tinturas (opcional). `""` o `null` lo borra.
   * @example "7.1"
   */
  @MaxLength(50, { message: 'La tonalidad no puede superar los 50 caracteres' })
  @IsString({ message: 'La tonalidad debe ser un texto' })
  @IsOptional()
  @Trim()
  tonalidad?: string | null;

  /** @example "VITRINA" */
  @IsEnum(TipoDeposito, {
    message: 'El depósito debe ser SALON, DEPOSITO o VITRINA',
  })
  @IsNotEmpty({ message: 'El depósito es obligatorio' })
  tipoDeposito: TipoDeposito;

  /**
   * Stock mínimo, en envases (admite decimales). Por defecto 0.
   * @example 2
   */
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  @IsNumber(TRES_DECIMALES, {
    message: 'El stock mínimo debe ser un número con hasta 3 decimales',
  })
  @IsOptional()
  stockMinAlert?: number;

  /**
   * Opcional. `null` la borra.
   * @example "2027-06-30"
   */
  @IsFecha('La fecha de vencimiento')
  @IsOptional()
  fechaVencimiento?: string | null;

  /**
   * Stock inicial, en envases (admite decimales). Solo al crear: después cambia
   * con los movimientos. Por defecto 0.
   * @example 6
   */
  @Min(0, { message: 'El stock no puede ser negativo' })
  @IsNumber(TRES_DECIMALES, {
    message: 'El stock debe ser un número con hasta 3 decimales',
  })
  @IsOptional()
  stock?: number;
}
