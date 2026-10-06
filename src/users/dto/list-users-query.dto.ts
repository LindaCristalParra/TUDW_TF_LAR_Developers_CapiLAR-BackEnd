import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Rol } from '../../generated/prisma/client';
import { Trim } from '../../auth/dto/trim.decorator';

// Query string of GET /users. Decorators run bottom-up (see stopAtFirstError in main.ts).
export class ListUsersQueryDto {
  /**
   * Busca en nombre, apellido o email. No distingue mayúsculas ni tildes.
   * @example "alvarez"
   */
  @MaxLength(100, {
    message: 'La búsqueda no puede superar los 100 caracteres',
  })
  @IsString({ message: 'La búsqueda debe ser un texto' })
  @IsOptional()
  @Trim()
  search?: string;

  /** Filtra por rol. */
  @IsEnum(Rol, { message: 'El rol debe ser ADMIN, PROFESIONAL o CLIENTE' })
  @IsOptional()
  rol?: Rol;

  /** `true` incluye a los usuarios dados de baja (por defecto se ocultan). */
  @IsBoolean({ message: 'incluirBajas debe ser true o false' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  incluirBajas?: boolean;
}
