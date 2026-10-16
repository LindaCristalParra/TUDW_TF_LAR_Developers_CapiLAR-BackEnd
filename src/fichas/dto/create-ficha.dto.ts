import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { FichaDto } from './ficha.dto';

export class CreateFichaDto extends FichaDto {
  /**
   * Servicio del turno (id de `detalles[]`) al que corresponde la ficha.
   * @example 12
   */
  @Min(1, { message: 'El servicio del turno no es válido' })
  @IsInt({ message: 'El servicio del turno debe ser un número' })
  @IsNotEmpty({ message: 'Indicá el servicio del turno (turnoDetalleId)' })
  turnoDetalleId: number;
}
