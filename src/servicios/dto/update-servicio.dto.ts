import { PartialType } from '@nestjs/swagger';
import { CreateServicioDto } from './create-servicio.dto';

// Same rules as creation; only the fields sent are updated.
export class UpdateServicioDto extends PartialType(CreateServicioDto) {}
