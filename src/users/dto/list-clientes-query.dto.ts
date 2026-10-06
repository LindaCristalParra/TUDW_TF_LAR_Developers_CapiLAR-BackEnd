import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

// Query string of GET /users/clientes. Decorators run bottom-up (see stopAtFirstError in main.ts).
export class ListClientesQueryDto {
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
}
