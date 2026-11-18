import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_DECIMAL_10_2 } from '../../articulos/dto/create-articulo.dto';
import { MetodoPago } from '../../generated/prisma/client';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class PrecioFinalDto {
  /** Un servicio (`detalles[].id`) de este turno. @example 31 */
  @Min(1, { message: 'El servicio del turno no es válido' })
  @IsInt({ message: 'El servicio del turno debe ser un id numérico' })
  @IsNotEmpty({ message: 'El servicio del turno es obligatorio' })
  turnoDetalleId: number;

  /**
   * Lo que se cobró por ese servicio, en pesos (puede ser 0).
   * @example 18000
   */
  @Max(MAX_DECIMAL_10_2, {
    message: 'El precio final no puede superar los $99.999.999,99',
  })
  @Min(0, { message: 'El precio final no puede ser negativo' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio final debe ser un número con hasta 2 decimales' },
  )
  @IsNotEmpty({ message: 'El precio final es obligatorio' })
  precioFinal: number;
}

export class CompletarTurnoDto {
  /**
   * Opcional: lo cobrado por cada servicio. Los servicios que no vienen se
   * cobran a su `precioBase`.
   */
  @ValidateNested({ each: true })
  @Type(() => PrecioFinalDto)
  @ArrayUnique((p: PrecioFinalDto) => p?.turnoDetalleId, {
    message: 'Un servicio del turno no se puede repetir',
  })
  @ArrayMaxSize(10, { message: 'Un turno puede tener hasta 10 servicios' })
  @IsArray({ message: 'Los precios deben ser una lista' })
  @IsOptional()
  detalles?: PrecioFinalDto[];

  /** Opcional: si viene, reemplaza el método de pago del turno. */
  @IsEnum(MetodoPago, {
    message:
      'El método de pago debe ser EFECTIVO, DEBITO, CREDITO o TRANSFERENCIA',
  })
  @IsOptional()
  metodoPago?: MetodoPago;
}
