import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NivelCapilar,
  TipoDePelo,
  VolumenDePelo,
} from '../generated/prisma/client';
import { SugerenciaDiagnostico } from './sugerencia.dto';

// Fixed answer for GEMINI_MODO=simulado: to develop without spending quota, and plan B for the demo.
export const SUGERENCIA_SIMULADA: SugerenciaDiagnostico = {
  porosidad: NivelCapilar.ALTA,
  elasticidad: NivelCapilar.MEDIA,
  porcentajeCanas: 10,
  tipoDePelo: TipoDePelo.ONDULADO,
  volumenDePelo: VolumenDePelo.MEDIO,
  observaciones: 'Medios y puntas con signos de decoloración previa.',
  simulado: true,
};

// AI hair diagnosis (TP3, API 3): a suggestion for the technical record from a photo, with Gemini.
// Always a suggestion: the professional reviews it before saving the record.
@Injectable()
export class DiagnosticoService {
  constructor(private readonly configService: ConfigService) {}

  /** Suggests the diagnosis fields from a photo of the hair. */
  async sugerir(
    _buffer: Buffer,
    _mime: string,
  ): Promise<SugerenciaDiagnostico> {
    if (this.configService.get<string>('GEMINI_MODO') === 'simulado') {
      return { ...SUGERENCIA_SIMULADA };
    }
    throw new Error('Gemini real mode is not implemented yet');
  }
}
