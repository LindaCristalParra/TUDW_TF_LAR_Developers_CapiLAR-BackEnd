import { PartialType } from '@nestjs/swagger';
import { CreateCategoriaDto } from './create-categoria.dto';

// Same rules as creation; only the fields sent are updated. nombre: null is a 400
// (skipNullProperties: false).
export class UpdateCategoriaDto extends PartialType(CreateCategoriaDto, {
  skipNullProperties: false,
}) {}
