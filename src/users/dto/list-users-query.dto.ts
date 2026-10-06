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
  // Matches nombre, apellido or email (MySQL collation ignores case and accents).
  @MaxLength(100, {
    message: 'La búsqueda no puede superar los 100 caracteres',
  })
  @IsString({ message: 'La búsqueda debe ser un texto' })
  @IsOptional()
  @Trim()
  search?: string;

  @IsEnum(Rol, { message: 'El rol debe ser ADMIN, PROFESIONAL o CLIENTE' })
  @IsOptional()
  rol?: Rol;

  // Deactivated users are hidden unless ?incluirBajas=true.
  @IsBoolean({ message: 'incluirBajas debe ser true o false' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  incluirBajas?: boolean;
}
