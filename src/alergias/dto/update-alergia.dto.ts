import { PartialType } from '@nestjs/swagger';
import { CreateAlergiaDto } from './create-alergia.dto';

// Same rules as creation; only the fields sent are updated. nombre: null is a 400
// (skipNullProperties: false); descripcion keeps its own @IsOptional(), so null clears it.
export class UpdateAlergiaDto extends PartialType(CreateAlergiaDto, {
  skipNullProperties: false,
}) {}
