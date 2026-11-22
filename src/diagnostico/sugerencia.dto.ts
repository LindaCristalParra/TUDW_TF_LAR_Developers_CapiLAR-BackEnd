import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NivelCapilar,
  TipoDePelo,
  UnidadInsumo,
  VolumenDePelo,
} from '../generated/prisma/client';

// What the AI suggests for a technical record (TP3, API 3). Nothing is saved: the professional
// reviews it and saves with PATCH /fichas/:id. Same names and values as the record, so the
// front-end can preload the form with it (diagnosis fields and `formulas`).

export class InsumoSugerido {
  /** Artículo del inventario: la IA solo sugiere artículos activos con stock. @example 12 */
  articuloId: number;

  /** Nombre del artículo. @example "Tintura 7.1" */
  producto: string;

  /** Marca y línea del artículo. @example "Question Professional Color" */
  marca: string;

  /** Tonalidad del artículo. @example "7.1" */
  @ApiProperty({ type: String, nullable: true })
  tono: string | null;

  /** En la unidad del artículo. @example 30 */
  cantidad: number;

  /** @example "G" */
  @ApiProperty({ enum: UnidadInsumo })
  unidad: UnidadInsumo;
}

export class FormulaSugerida {
  /** @example "Raíz" */
  descripcion?: string;

  /** Volumen del oxidante (1 a 60). @example 20 */
  oxidanteVolumen?: number;

  /** Tiempo de pose en minutos (1 a 240). @example 35 */
  tiempoPoseMin?: number;

  @ApiProperty({ type: [InsumoSugerido] })
  insumos: InsumoSugerido[];
}

export class AnalisisSugerido {
  /**
   * Cómo viene evolucionando el cabello según las fichas anteriores y la foto.
   * @example "La porosidad subió de MEDIA a ALTA en las dos últimas decoloraciones."
   */
  evolucion?: string;

  /**
   * Cosas a tener en cuenta antes de trabajar (alergias, procesos químicos seguidos, daño).
   * @example ["Alergia al amoníaco: evitar tinturas con amoníaco."]
   */
  @ApiProperty({ type: [String] })
  alertas: string[];

  /**
   * Qué conviene hacer hoy.
   * @example "Hidratación profunda antes de volver a decolorar."
   */
  recomendacion?: string;
}

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

  analisis: AnalisisSugerido;

  /**
   * Fórmula sugerida, en el orden en que se aplica. Vacía si el servicio no
   * lleva fórmula (por ejemplo, un corte) o si no hay artículos que sirvan.
   */
  @ApiProperty({ type: [FormulaSugerida] })
  formulas: FormulaSugerida[];

  /** `true` si la respuesta es fija (GEMINI_MODO=simulado), sin llamar a Gemini. */
  simulado: boolean;
}
