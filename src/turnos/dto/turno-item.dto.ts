import { IsInt, IsNotEmpty, Min } from 'class-validator';

// One service of the turno and who does it. Services are done in the order they are sent.
export class TurnoItemDto {
  /** @example 1 */
  @Min(1, { message: 'El servicio no es válido' })
  @IsInt({ message: 'El servicio debe ser un número' })
  @IsNotEmpty({ message: 'El servicio es obligatorio' })
  servicioId: number;

  /**
   * Legajo del profesional que hace este servicio.
   * @example 1
   */
  @Min(1, { message: 'El legajo no es válido' })
  @IsInt({ message: 'El legajo debe ser un número' })
  @IsNotEmpty({ message: 'El legajo es obligatorio' })
  legajo: number;
}
