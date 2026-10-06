import { IsInt, IsNotEmpty, Min } from 'class-validator';

// Decorators run bottom-up, so the most basic rule goes last (see stopAtFirstError in main.ts).
export class AsignarServicioDto {
  /** @example 1 */
  @Min(1, { message: 'El servicio no es válido' })
  @IsInt({ message: 'El servicio debe ser un número' })
  @IsNotEmpty({ message: 'El servicio es obligatorio' })
  servicioId: number;
}
