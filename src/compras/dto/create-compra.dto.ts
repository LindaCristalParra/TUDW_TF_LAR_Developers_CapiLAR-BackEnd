import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_DECIMAL_10_2,
  MAX_DECIMAL_10_3,
} from '../../articulos/dto/create-articulo.dto';
import { Trim } from '../../auth/dto/trim.decorator';

export const MAX_LINEAS_COMPRA = 50;

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class LineaCompraDto {
  /** Un artículo activo. @example 12 */
  @Min(1, { message: 'El artículo no es válido' })
  @IsInt({ message: 'El artículo debe ser un id numérico' })
  @IsNotEmpty({ message: 'El artículo es obligatorio' })
  articuloId: number;

  /**
   * Envases comprados, mayor a 0 (admite hasta 3 decimales).
   * @example 6
   */
  @Max(MAX_DECIMAL_10_3, {
    message: 'La cantidad no puede superar los 9.999.999,999 envases',
  })
  @Min(0.001, { message: 'La cantidad debe ser mayor a 0' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La cantidad debe ser un número con hasta 3 decimales' },
  )
  @IsNotEmpty({ message: 'La cantidad es obligatoria' })
  cantidad: number;

  /**
   * Lo que costó un envase, en pesos. Pasa a ser el `precioCosto` del artículo.
   * @example 8400
   */
  @Max(MAX_DECIMAL_10_2, {
    message: 'El costo unitario no puede superar los $99.999.999,99',
  })
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El costo unitario debe ser un número con hasta 2 decimales' },
  )
  @IsNotEmpty({ message: 'El costo unitario es obligatorio' })
  costoUnitario: number;
}

export class CreateCompraDto {
  /** Un proveedor activo. @example 3 */
  @Min(1, { message: 'El proveedor no es válido' })
  @IsInt({ message: 'El proveedor debe ser un id numérico' })
  @IsNotEmpty({ message: 'El proveedor es obligatorio' })
  proveedorId: number;

  /**
   * Número de la factura o remito del proveedor. No se puede repetir para el
   * mismo proveedor (las compras anuladas no cuentan).
   * @example "0001-00012345"
   */
  @MaxLength(30, {
    message: 'El comprobante no puede superar los 30 caracteres',
  })
  @IsString({ message: 'El comprobante debe ser un texto' })
  @IsNotEmpty({ message: 'El número de comprobante es obligatorio' })
  @Trim()
  numComprobante: string;

  /** Un artículo por línea, sin repetir. */
  @ValidateNested({ each: true })
  @Type(() => LineaCompraDto)
  @ArrayUnique((linea: LineaCompraDto) => linea?.articuloId, {
    message:
      'Un artículo no se puede repetir en la compra (sumá las cantidades)',
  })
  @ArrayMaxSize(MAX_LINEAS_COMPRA, {
    message: `Una compra puede tener hasta ${MAX_LINEAS_COMPRA} artículos`,
  })
  @ArrayMinSize(1, {
    message: 'La compra tiene que tener al menos un artículo',
  })
  @IsArray({ message: 'Las líneas deben ser una lista' })
  @IsNotEmpty({ message: 'Las líneas son obligatorias' })
  lineas: LineaCompraDto[];
}
