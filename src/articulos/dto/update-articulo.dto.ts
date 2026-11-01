import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateArticuloDto } from './create-articulo.dto';

// Same rules as creation; only the fields sent are updated. Stock only changes through movements.
export class UpdateArticuloDto extends PartialType(
  OmitType(CreateArticuloDto, ['stock'] as const),
) {}
