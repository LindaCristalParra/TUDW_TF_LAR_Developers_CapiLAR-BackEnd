import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import { IsFecha } from '../../common/fecha-hora';
import { PaginacionQueryDto } from '../../common/paginacion';
import { EstadoRemito } from '../../generated/prisma/client';

const ESTADOS_COMPRA = [EstadoRemito.APLICADO, EstadoRemito.ANULADO] as const;

// Query string of GET /compras. Decorators run bottom-up (see stopAtFirstError in main.ts).
export class ListComprasQueryDto extends PaginacionQueryDto {
  /** Solo las de ese proveedor. */
  @Min(1, { message: 'El proveedor no es válido' })
  @IsInt({ message: 'El proveedor debe ser un id numérico' })
  @Type(() => Number)
  @IsOptional()
  proveedorId?: number;

  /** APLICADO o ANULADO (sin filtro, las dos). */
  // PENDIENTE exists in the enum but purchases are born APLICADO (decided 07/11).
  @IsIn(ESTADOS_COMPRA, { message: 'El estado debe ser APLICADO o ANULADO' })
  @IsOptional()
  estado?: (typeof ESTADOS_COMPRA)[number];

  /** Cargadas desde ese día (hora del salón). @example "2026-11-01" */
  @IsFecha('desde')
  @IsOptional()
  desde?: string;

  /** Cargadas hasta ese día, incluido (hora del salón). @example "2026-11-30" */
  @IsFecha('hasta')
  @IsOptional()
  hasta?: string;

  /** Busca en el número de comprobante (una parte alcanza). @example "12345" */
  @MaxLength(30, {
    message: 'El comprobante no puede superar los 30 caracteres',
  })
  @IsString({ message: 'El comprobante debe ser un texto' })
  @IsOptional()
  @Trim()
  numComprobante?: string;
}
