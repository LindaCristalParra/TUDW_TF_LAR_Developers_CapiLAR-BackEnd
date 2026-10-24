import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiError,
  GenerateContentResponse,
  GoogleGenAI,
  ThinkingLevel,
} from '@google/genai';
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

// A fixed model rather than gemini-flash-latest: the alias jumps to each new Flash, which is often
// overloaded on the free tier right after launch (503 "high demand" or answers past 30 s).
const MODELO_POR_DEFECTO = 'gemini-3.6-flash';
const TIEMPO_MAXIMO_MS = 30_000;
const MAX_OBSERVACIONES = 500;

const PROMPT =
  'Sos asistente de una peluquería. Evaluá solo el cabello de la foto para precargar una ficha ' +
  'técnica. Respondé únicamente con los campos del esquema. En observaciones, una frase sobre ' +
  'daño o procesos químicos visibles. Si la foto no muestra cabello con claridad, decilo en ' +
  'observaciones.';

// Response schema with the same values as the Prisma enums, so Gemini answers in the record's terms.
const ESQUEMA = {
  type: 'object',
  properties: {
    porosidad: { type: 'string', enum: Object.values(NivelCapilar) },
    elasticidad: { type: 'string', enum: Object.values(NivelCapilar) },
    porcentajeCanas: { type: 'integer', minimum: 0, maximum: 100 },
    tipoDePelo: { type: 'string', enum: Object.values(TipoDePelo) },
    volumenDePelo: { type: 'string', enum: Object.values(VolumenDePelo) },
    observaciones: { type: 'string' },
  },
  required: ['porosidad', 'tipoDePelo', 'volumenDePelo'],
};

function enumValido<T extends string>(
  valores: Record<string, T>,
  valor: unknown,
): T | undefined {
  return Object.values(valores).includes(valor as T) ? (valor as T) : undefined;
}

/**
 * Turns Gemini's text into a suggestion the database accepts: any field outside its enum or
 * range is dropped, so the model can't slip in a value the record would reject.
 * null when the text isn't a JSON object or none of its fields is valid.
 */
export function validarSugerencia(
  texto: string | undefined,
): Omit<SugerenciaDiagnostico, 'simulado'> | null {
  let datos: unknown;
  try {
    datos = JSON.parse(texto ?? '');
  } catch {
    return null;
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return null;
  }
  const crudo = datos as Record<string, unknown>;

  const canas = crudo.porcentajeCanas;
  const observaciones =
    typeof crudo.observaciones === 'string'
      ? crudo.observaciones.trim().slice(0, MAX_OBSERVACIONES)
      : '';
  const sugerencia: Omit<SugerenciaDiagnostico, 'simulado'> = {
    porosidad: enumValido(NivelCapilar, crudo.porosidad),
    elasticidad: enumValido(NivelCapilar, crudo.elasticidad),
    porcentajeCanas:
      typeof canas === 'number' && canas >= 0 && canas <= 100
        ? Math.round(canas)
        : undefined,
    tipoDePelo: enumValido(TipoDePelo, crudo.tipoDePelo),
    volumenDePelo: enumValido(VolumenDePelo, crudo.volumenDePelo),
    observaciones: observaciones || undefined,
  };

  // Without the undefined keys, so the JSON only has what Gemini really suggested.
  const limpia = Object.fromEntries(
    Object.entries(sugerencia).filter(([, valor]) => valor !== undefined),
  );
  return Object.keys(limpia).length ? limpia : null;
}

// AI hair diagnosis (TP3, API 3): a suggestion for the technical record from a photo, with Gemini.
// Always a suggestion: the professional reviews it before saving the record.
@Injectable()
export class DiagnosticoService {
  private readonly logger = new Logger(DiagnosticoService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Suggests the diagnosis fields from a photo of the hair. */
  async sugerir(buffer: Buffer, mime: string): Promise<SugerenciaDiagnostico> {
    if (this.configService.get<string>('GEMINI_MODO') === 'simulado') {
      return { ...SUGERENCIA_SIMULADA };
    }

    const tiempo = AbortSignal.timeout(TIEMPO_MAXIMO_MS);
    let respuesta: GenerateContentResponse;
    try {
      respuesta = await this.generar(buffer, mime, tiempo);
    } catch (error) {
      throw this.traducirError(error, tiempo);
    }

    const sugerencia = validarSugerencia(respuesta.text);
    if (!sugerencia) {
      this.logger.error(
        `Gemini gave no usable suggestion (block: ${respuesta.promptFeedback?.blockReason ?? '-'}, finish: ${respuesta.candidates?.[0]?.finishReason ?? '-'})`,
      );
      throw new BadGatewayException('No se pudo analizar la foto');
    }
    return { ...sugerencia, simulado: false };
  }

  // The call itself: the photo inline (base64), the fixed prompt and the response schema.
  private generar(
    buffer: Buffer,
    mime: string,
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    const ai = new GoogleGenAI({
      apiKey: this.configService.getOrThrow<string>('GEMINI_API_KEY'),
    });
    return ai.models.generateContent({
      model:
        this.configService.get<string>('GEMINI_MODEL') || MODELO_POR_DEFECTO,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mime, data: buffer.toString('base64') } },
            { text: PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: ESQUEMA,
        // Low, so the same photo gives (almost) the same suggestion.
        temperature: 0.2,
        // Flash 3.x models think at MEDIUM by default and can go past the 30 s limit; filling six
        // fields from a photo doesn't need it. LOW is the lowest level every Flash 3.x accepts.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal,
      },
    });
  }

  // Gemini's failures as HTTP errors for the front-end. The detail goes to the log, never the key.
  private traducirError(error: unknown, tiempo: AbortSignal): Error {
    if (tiempo.aborted) {
      return new GatewayTimeoutException(
        'El análisis de la foto tardó demasiado. Probá de nuevo.',
      );
    }
    // 429: our quota per minute; 503: the model is overloaded on Google's side. Both pass soon.
    if (
      error instanceof ApiError &&
      (error.status === 429 || error.status === 503)
    ) {
      return new ServiceUnavailableException(
        'El asistente de IA está ocupado. Probá en un minuto.',
      );
    }
    this.logger.error(
      `Gemini call failed${error instanceof ApiError ? ` (${error.status})` : ''}`,
      error instanceof Error ? error.message : String(error),
    );
    return new BadGatewayException(
      'El asistente de IA no está disponible en este momento',
    );
  }
}
