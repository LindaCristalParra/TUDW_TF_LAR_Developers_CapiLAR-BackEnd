import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class AnularCompraDto {
  /**
   * Por qué se anula (decidido 07/11: obligatorio). Queda en el `motivo` de la
   * compra.
   * @example "Se cargó con el proveedor equivocado"
   */
  @MaxLength(255, { message: 'El motivo no puede superar los 255 caracteres' })
  @IsString({ message: 'El motivo debe ser un texto' })
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @Trim()
  motivo: string;
}
