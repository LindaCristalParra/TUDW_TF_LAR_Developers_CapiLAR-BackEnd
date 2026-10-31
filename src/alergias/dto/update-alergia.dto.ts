import { PartialType } from '@nestjs/swagger';
import { CreateAlergiaDto } from './create-alergia.dto';

// Same rules as creation; only the fields sent are updated.
export class UpdateAlergiaDto extends PartialType(CreateAlergiaDto) {}
