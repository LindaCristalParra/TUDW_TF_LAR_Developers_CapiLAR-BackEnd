import { PartialType } from '@nestjs/swagger';
import { CreateMarcaDto } from './create-marca.dto';

// Same rules as creation; only the fields sent are updated. razonSocial: null is a 400
// (skipNullProperties: false); linea keeps its own @IsOptional(), so null clears it.
export class UpdateMarcaDto extends PartialType(CreateMarcaDto, {
  skipNullProperties: false,
}) {}
