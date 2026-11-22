import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  NivelCapilar,
  TipoDePelo,
  VolumenDePelo,
} from '../generated/prisma/client';

// What the AI suggests for the diagnosis fields of a technical record (TP3, API 3).
// Same names and values as FichaDto, so the front-end can preload the form with it.
// Nothing is saved: the professional reviews it and saves with PATCH /fichas/:id.
export class SugerenciaDiagnostico {
  /** @example "ALTA" */
  @ApiPropertyOptional({ enum: NivelCapilar })
  porosidad?: NivelCapilar;

  /** @example "MEDIA" */
  @ApiPropertyOptional({ enum: NivelCapilar })
  elasticidad?: NivelCapilar;

  /**
   * Porcentaje de canas, de 0 a 100.
   * @example 10
   */
  porcentajeCanas?: number;

  /** @example "ONDULADO" */
  @ApiPropertyOptional({ enum: TipoDePelo })
  tipoDePelo?: TipoDePelo;

  /** @example "MEDIO" */
  @ApiPropertyOptional({ enum: VolumenDePelo })
  volumenDePelo?: VolumenDePelo;

  /**
   * Una frase sobre daño o procesos químicos visibles. No se precarga en la ficha.
   * @example "Medios y puntas con signos de decoloración previa."
   */
  observaciones?: string;

  /** `true` si la respuesta es fija (GEMINI_MODO=simulado), sin llamar a Gemini. */
  simulado: boolean;
}
