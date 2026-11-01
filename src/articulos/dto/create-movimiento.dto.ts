import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import { TipoRemito } from '../../generated/prisma/client';
import { MAX_DECIMAL_10_3 } from './create-articulo.dto';

// COMPRA comes with suppliers (F13).
export const TIPOS_MOVIMIENTO = [
  TipoRemito.INGRESO,
  TipoRemito.EGRESO,
  TipoRemito.AJUSTE,
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class CreateMovimientoDto {
  /**
   * INGRESO suma, EGRESO resta, AJUSTE deja el stock en lo contado.
   * @example "EGRESO"
   */
  @IsIn(TIPOS_MOVIMIENTO, {
    message: 'El tipo debe ser INGRESO, EGRESO o AJUSTE',
  })
  @IsNotEmpty({ message: 'El tipo es obligatorio' })
  tipo: TipoMovimiento;

  /**
   * En envases (admite decimales). INGRESO y EGRESO: cuánto entra o sale (mayor
   * a 0). AJUSTE: el stock contado (puede ser 0); el back guarda la diferencia.
   * @example 1.5
   */
  @Max(MAX_DECIMAL_10_3, {
    message: 'La cantidad no puede superar los 9.999.999,999 envases',
  })
  @Min(0, { message: 'La cantidad no puede ser negativa' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La cantidad debe ser un número con hasta 3 decimales' },
  )
  @IsNotEmpty({ message: 'La cantidad es obligatoria' })
  cantidad: number;

  /**
   * Obligatorio en EGRESO y AJUSTE (ej. "Se rompió", "Conteo mensual").
   * @example "Se cayó y se rompió"
   */
  @MaxLength(255, { message: 'El motivo no puede superar los 255 caracteres' })
  @IsString({ message: 'El motivo debe ser un texto' })
  @IsNotEmpty({ message: 'El motivo es obligatorio en un egreso o un ajuste' })
  // Optional in an INGRESO: there, "" or null just means no reason.
  @ValidateIf(
    (dto: CreateMovimientoDto, motivo) =>
      dto.tipo !== TipoRemito.INGRESO || Boolean(motivo),
  )
  @Trim()
  motivo?: string | null;

  /**
   * Opcional: número de factura o ticket.
   * @example "0001-00012345"
   */
  @MaxLength(30, {
    message: 'El comprobante no puede superar los 30 caracteres',
  })
  @IsString({ message: 'El comprobante debe ser un texto' })
  @IsOptional()
  @Trim()
  numComprobante?: string | null;
}
