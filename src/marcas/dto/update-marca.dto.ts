import { PartialType } from '@nestjs/swagger';
import { CreateMarcaDto } from './create-marca.dto';

// Same rules as creation; only the fields sent are updated.
export class UpdateMarcaDto extends PartialType(CreateMarcaDto) {}
