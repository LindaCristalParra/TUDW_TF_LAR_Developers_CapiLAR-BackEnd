import { IsEnum, IsNotEmpty } from 'class-validator';
import { MomentoFoto } from '../../generated/prisma/client';

// Sent as a text field of the same multipart form as the photo.
export class SubirFotoFichaDto {
  /** @example "ANTES" */
  @IsEnum(MomentoFoto, { message: 'El tipo debe ser ANTES o DESPUES' })
  @IsNotEmpty({ message: 'Indicá si la foto es de ANTES o de DESPUES (tipo)' })
  tipo: MomentoFoto;
}
