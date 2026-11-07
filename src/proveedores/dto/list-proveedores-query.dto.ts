import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

const aBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

// Query string of GET /proveedores. Decorators run bottom-up (see stopAtFirstError in main.ts).
export class ListProveedoresQueryDto {
  /**
   * Busca en la razón social y el CUIT (con o sin guiones). No distingue
   * mayúsculas ni tildes.
   * @example "meraki"
   */
  @MaxLength(150, {
    message: 'La búsqueda no puede superar los 150 caracteres',
  })
  @IsString({ message: 'La búsqueda debe ser un texto' })
  @IsOptional()
  @Trim()
  search?: string;

  /** `true` incluye los dados de baja (por defecto se ocultan). */
  @IsBoolean({ message: 'incluirBajas debe ser true o false' })
  @IsOptional()
  @Transform(aBoolean)
  incluirBajas?: boolean;
}
