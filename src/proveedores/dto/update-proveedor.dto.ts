import { PartialType } from '@nestjs/swagger';
import { CreateProveedorDto } from './create-proveedor.dto';

// Same rules as creation; only the fields sent are updated. cuit/razonSocial: null is a 400
// (skipNullProperties: false); the optional texts keep their own @IsOptional(), so null clears them.
export class UpdateProveedorDto extends PartialType(CreateProveedorDto, {
  skipNullProperties: false,
}) {}
