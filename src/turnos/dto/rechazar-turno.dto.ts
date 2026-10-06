import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../auth/dto/trim.decorator';
import { IsFecha, IsHora } from '../../common/fecha-hora';

export class AlternativaDto {
  /** @example "2026-10-08" */
  @IsFecha('La fecha de la alternativa')
  @IsNotEmpty({ message: 'La fecha de la alternativa es obligatoria' })
  fecha: string;

  /** @example "10:00" */
  @IsHora('La hora de la alternativa')
  @IsNotEmpty({ message: 'La hora de la alternativa es obligatoria' })
  horaInicio: string;
}

// Decorators run bottom-up (see stopAtFirstError in main.ts).
export class RechazarTurnoDto {
  /**
   * Motivo interno, para análisis del salón. El cliente no lo ve.
   * @example "No da el tiempo para esa tarea"
   */
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres' })
  @IsString({ message: 'El motivo debe ser un texto' })
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @Trim()
  motivo: string;

  /**
   * Horarios que el profesional le ofrece al cliente (los que quiera). Mismos
   * servicios y profesionales; tienen que estar libres.
   */
  @ValidateNested({ each: true })
  @Type(() => AlternativaDto)
  @ArrayMaxSize(10, { message: 'Se pueden ofrecer hasta 10 alternativas' })
  @IsArray({ message: 'Las alternativas deben ser una lista' })
  @IsOptional()
  alternativas?: AlternativaDto[];
}
