import { PartialType } from '@nestjs/swagger';
import { CreateServicioDto } from './create-servicio.dto';

// Same rules as creation; only the fields sent are updated. skipNullProperties: false → null is
// validated (400) instead of skipped, so it never reaches a NOT NULL column. descripcion keeps its
// own @IsOptional(), so null clears it.
export class UpdateServicioDto extends PartialType(CreateServicioDto, {
  skipNullProperties: false,
}) {}
