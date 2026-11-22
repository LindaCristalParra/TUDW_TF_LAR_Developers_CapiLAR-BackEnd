import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NivelCapilar,
  TipoDePelo,
  VolumenDePelo,
} from '../../generated/prisma/client';

// Diagnosis of the client's latest closed record that has one, to preload a new record.
export class DiagnosticoAnteriorDto {
  /** @example 31 */
  fichaId: number;

  /**
   * Fecha del turno de esa ficha.
   * @example "2026-11-10"
   */
  fecha: string;

  /** @example "Balayage" */
  servicio: string;

  /** @example "ALTA" */
  @ApiPropertyOptional({ enum: NivelCapilar, nullable: true })
  porosidad: NivelCapilar | null;

  /** @example "MEDIA" */
  @ApiPropertyOptional({ enum: NivelCapilar, nullable: true })
  elasticidad: NivelCapilar | null;

  /**
   * Porcentaje de canas, de 0 a 100.
   * @example 10
   */
  @ApiPropertyOptional({ nullable: true, type: Number })
  porcentajeCanas: number | null;

  /** @example "ONDULADO" */
  @ApiPropertyOptional({ enum: TipoDePelo, nullable: true })
  tipoDePelo: TipoDePelo | null;

  /** @example "MEDIO" */
  @ApiPropertyOptional({ enum: VolumenDePelo, nullable: true })
  volumenDePelo: VolumenDePelo | null;
}

export class UltimoDiagnosticoDto {
  /** null si la clienta no tiene ninguna ficha cerrada con diagnóstico. */
  @ApiProperty({ type: DiagnosticoAnteriorDto, nullable: true })
  diagnostico: DiagnosticoAnteriorDto | null;
}
