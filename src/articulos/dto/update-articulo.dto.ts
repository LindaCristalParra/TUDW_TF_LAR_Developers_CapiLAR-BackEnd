import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateArticuloDto } from './create-articulo.dto';

// Same rules as creation; only the fields sent are updated. Stock only changes through movements.
// skipNullProperties: false → null is validated (400) instead of skipped, so it never reaches a
// NOT NULL column. The nullable fields keep their own @IsOptional().
export class UpdateArticuloDto extends PartialType(
  OmitType(CreateArticuloDto, ['stock'] as const),
  { skipNullProperties: false },
) {}
