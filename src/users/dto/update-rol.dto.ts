import { IsEnum, IsNotEmpty } from 'class-validator';
import { Rol } from '../../generated/prisma/client';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class UpdateRolDto {
  @IsEnum(Rol, { message: 'El rol debe ser ADMIN, PROFESIONAL o CLIENTE' })
  @IsNotEmpty({ message: 'El rol es obligatorio' })
  rol: Rol;
}
