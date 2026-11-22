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
  Part,
  ThinkingLevel,
} from '@google/genai';
import { MAX_DECIMAL_10_2 } from '../articulos/dto/create-articulo.dto';
import {
  NivelCapilar,
  TipoDePelo,
  TipoProducto,
  VolumenDePelo,
} from '../generated/prisma/client';
import { ArticuloDisponible, ContextoDiagnostico } from './contexto';
import {
  AnalisisSugerido,
  FormulaSugerida,
  InsumoSugerido,
  SugerenciaDiagnostico,
} from './sugerencia.dto';

// A fixed model rather than gemini-flash-latest: the alias jumps to each new Flash, which is often
// overloaded on the free tier right after launch (503 "high demand" or answers past the limit).
const MODELO_POR_DEFECTO = 'gemini-3.6-flash';
const TIEMPO_MAXIMO_MS = 30_000;

// Limits of what is kept from the answer (the record's own limits where it has them).
const MAX_TEXTO = 1000;
const MAX_ALERTAS = 6;
const MAX_LARGO_ALERTA = 300;
const MAX_FORMULAS = 5;
const MAX_INSUMOS = 20;
const MAX_DESCRIPCION_FORMULA = 500;

const INSTRUCCIONES = [
  'Sos asistente técnica de una peluquería. Con los datos de la clienta (JSON) y, si viene, la foto',
  'de ANTES de hoy, sugerí cómo completar la ficha técnica del servicio de hoy (fichaActual).',
  'Es solo una sugerencia: la profesional la revisa antes de guardarla.',
  '',
  '- Diagnóstico (porosidad, elasticidad, porcentajeCanas, tipoDePelo, volumenDePelo): basate en la',
  '  foto si viene y en la evolución de fichasAnteriores. Si la ficha actual ya tiene un valor,',
  '  respetalo salvo que la foto lo contradiga claramente. Si no hay base para un campo, omitilo.',
  '- Si la foto no muestra cabello con claridad, decilo en analisis.alertas y no te bases en ella.',
  '- analisis.evolucion: una o dos frases sobre cómo viene cambiando el cabello entre fichas.',
  '- analisis.alertas: avisos concretos antes de trabajar (alergias de la lista, procesos químicos',
  '  muy seguidos, porosidad alta antes de decolorar, reacciones o problemas anotados). Lista vacía',
  '  si no hay.',
  '- analisis.recomendacion: qué conviene hacer hoy, en una o dos frases.',
  '- formulas: solo si el servicio de hoy usa productos químicos o de tratamiento (color,',
  '  decoloración, matización, alisado, tratamientos). Usá ÚNICAMENTE artículos de la lista',
  '  "articulos" por su id, con la cantidad en su unidad (G, ML o UNIDAD). Tomá como base las',
  '  fórmulas anteriores que funcionaron. Elegí el tono solo con base en esas fórmulas o en lo que',
  '  se ve en la foto; sin esa base, no sugieras fórmula. Nunca uses un producto que choque con',
  '  una alergia. Si el servicio no lleva fórmula o no hay artículos adecuados, devolvé una lista',
  '  vacía.',
  '- Escribí en español rioplatense, breve y técnico. No inventes datos que no estén.',
].join('\n');

// Response schema with the same values as the Prisma enums, so Gemini answers in the record's terms.
const ESQUEMA = {
  type: 'object',
  properties: {
    porosidad: { type: 'string', enum: Object.values(NivelCapilar) },
    elasticidad: { type: 'string', enum: Object.values(NivelCapilar) },
    porcentajeCanas: { type: 'integer', minimum: 0, maximum: 100 },
    tipoDePelo: { type: 'string', enum: Object.values(TipoDePelo) },
    volumenDePelo: { type: 'string', enum: Object.values(VolumenDePelo) },
    analisis: {
      type: 'object',
      properties: {
        evolucion: { type: 'string' },
        alertas: { type: 'array', items: { type: 'string' } },
        recomendacion: { type: 'string' },
      },
      required: ['alertas'],
    },
    formulas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descripcion: { type: 'string' },
          oxidanteVolumen: { type: 'integer', minimum: 1, maximum: 60 },
          tiempoPoseMin: { type: 'integer', minimum: 1, maximum: 240 },
          insumos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                articuloId: { type: 'integer' },
                cantidad: { type: 'number' },
              },
              required: ['articuloId', 'cantidad'],
            },
          },
        },
        required: ['insumos'],
      },
    },
  },
  required: ['analisis', 'formulas'],
};

function enumValido<T extends string>(
  valores: Record<string, T>,
  valor: unknown,
): T | undefined {
  return Object.values(valores).includes(valor as T) ? (valor as T) : undefined;
}

function texto(valor: unknown, max: number): string | undefined {
  return typeof valor === 'string' && valor.trim()
    ? valor.trim().slice(0, max)
    : undefined;
}

function entero(valor: unknown, min: number, max: number): number | undefined {
  return typeof valor === 'number' && valor >= min && valor <= max
    ? Math.round(valor)
    : undefined;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

// Without the undefined keys, so the JSON only has what Gemini really suggested.
function sinVacios<T extends object>(valor: T): T {
  return Object.fromEntries(
    Object.entries(valor).filter(([, v]) => v !== undefined),
  ) as T;
}

function validarAnalisis(crudo: unknown): AnalisisSugerido {
  const a = objeto(crudo) ?? {};
  const alertas = Array.isArray(a.alertas)
    ? a.alertas
        .map((x) => texto(x, MAX_LARGO_ALERTA))
        .filter((x): x is string => !!x)
        .slice(0, MAX_ALERTAS)
    : [];
  return sinVacios({
    evolucion: texto(a.evolucion, MAX_TEXTO),
    alertas,
    recomendacion: texto(a.recomendacion, MAX_TEXTO),
  });
}

// Only items from the list sent to Gemini (active, in stock, for the salon); producto, marca, tono
// and unidad come from the item, never from the answer. A repeated item in a formula is dropped.
function validarFormulas(
  crudo: unknown,
  articulos: Map<number, ArticuloDisponible>,
): FormulaSugerida[] {
  if (!Array.isArray(crudo)) {
    return [];
  }
  const formulas: FormulaSugerida[] = [];
  for (const item of crudo.slice(0, MAX_FORMULAS)) {
    const f = objeto(item);
    if (!f) continue;
    const usados = new Set<number>();
    const insumos: InsumoSugerido[] = [];
    for (const i of Array.isArray(f.insumos) ? f.insumos : []) {
      const insumo = objeto(i);
      const articulo = articulos.get(insumo?.articuloId as number);
      const cantidad = insumo?.cantidad;
      if (
        !articulo ||
        usados.has(articulo.id) ||
        typeof cantidad !== 'number' ||
        !(cantidad > 0) ||
        cantidad > MAX_DECIMAL_10_2 ||
        insumos.length >= MAX_INSUMOS
      ) {
        continue;
      }
      usados.add(articulo.id);
      insumos.push({
        articuloId: articulo.id,
        producto: articulo.nombre,
        marca: articulo.marca,
        tono: articulo.tonalidad,
        cantidad: Math.round(cantidad * 100) / 100,
        unidad: articulo.unidad,
      });
    }
    const descripcion = texto(f.descripcion, MAX_DESCRIPCION_FORMULA);
    if (!insumos.length && !descripcion) continue;
    formulas.push(
      sinVacios({
        descripcion,
        oxidanteVolumen: entero(f.oxidanteVolumen, 1, 60),
        tiempoPoseMin: entero(f.tiempoPoseMin, 1, 240),
        insumos,
      }),
    );
  }
  return formulas;
}

/**
 * Turns Gemini's text into a suggestion the database accepts: any field outside its enum or
 * range is dropped, and the formula only keeps items from `articulos`, so the model can't slip in
 * a value the record would reject or a product the salon doesn't have.
 * null when the text isn't a JSON object or nothing in it is usable.
 */
export function validarSugerencia(
  textoGemini: string | undefined,
  articulos: ArticuloDisponible[],
): Omit<SugerenciaDiagnostico, 'simulado'> | null {
  let datos: unknown;
  try {
    datos = JSON.parse(textoGemini ?? '');
  } catch {
    return null;
  }
  const crudo = objeto(datos);
  if (!crudo) {
    return null;
  }

  const sugerencia = sinVacios({
    porosidad: enumValido(NivelCapilar, crudo.porosidad),
    elasticidad: enumValido(NivelCapilar, crudo.elasticidad),
    porcentajeCanas: entero(crudo.porcentajeCanas, 0, 100),
    tipoDePelo: enumValido(TipoDePelo, crudo.tipoDePelo),
    volumenDePelo: enumValido(VolumenDePelo, crudo.volumenDePelo),
    analisis: validarAnalisis(crudo.analisis),
    formulas: validarFormulas(
      crudo.formulas,
      new Map(articulos.map((a) => [a.id, a])),
    ),
  });

  const { analisis, formulas, ...campos } = sugerencia;
  const vacia =
    !Object.keys(campos).length &&
    !analisis.evolucion &&
    !analisis.recomendacion &&
    !analisis.alertas.length &&
    !formulas.length;
  return vacia ? null : sugerencia;
}

/**
 * Fixed answer for GEMINI_MODO=simulado: to develop without spending quota, and plan B for the
 * demo. Its formula uses the first dye and developer in stock, if there are any.
 */
export function sugerenciaSimulada(
  contexto: ContextoDiagnostico,
): SugerenciaDiagnostico {
  const tintura = contexto.articulos.find(
    (a) => a.tipoProducto === TipoProducto.TINTURA,
  );
  const oxidante = contexto.articulos.find(
    (a) => a.tipoProducto === TipoProducto.OXIDANTE,
  );
  const insumos = [
    tintura && { articulo: tintura, cantidad: 30 },
    oxidante && { articulo: oxidante, cantidad: 45 },
  ]
    .filter((x) => !!x)
    .map(({ articulo, cantidad }) => ({
      articuloId: articulo.id,
      producto: articulo.nombre,
      marca: articulo.marca,
      tono: articulo.tonalidad,
      cantidad,
      unidad: articulo.unidad,
    }));
  return {
    porosidad: NivelCapilar.ALTA,
    elasticidad: NivelCapilar.MEDIA,
    porcentajeCanas: 10,
    tipoDePelo: TipoDePelo.ONDULADO,
    volumenDePelo: VolumenDePelo.MEDIO,
    analisis: {
      evolucion:
        'Respuesta simulada: medios y puntas con signos de decoloración previa.',
      alertas: contexto.alergias.map((a) => `Alergia: ${a}.`),
      recomendacion: 'Respuesta simulada: hidratar antes de aplicar color.',
    },
    formulas: insumos.length
      ? [
          {
            descripcion: 'Raíz',
            oxidanteVolumen: 20,
            tiempoPoseMin: 35,
            insumos,
          },
        ]
      : [],
    simulado: true,
  };
}

// AI hair diagnosis (TP3, API 3): a suggestion for the technical record from the client's history
// and the ANTES photo, with Gemini. Always a suggestion: the professional reviews it before saving.
@Injectable()
export class DiagnosticoService {
  private readonly logger = new Logger(DiagnosticoService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Suggests the record's diagnosis, an analysis and a formula. */
  async sugerir(
    contexto: ContextoDiagnostico,
    foto: { buffer: Buffer; mime: string } | null,
  ): Promise<SugerenciaDiagnostico> {
    if (this.configService.get<string>('GEMINI_MODO') === 'simulado') {
      return sugerenciaSimulada(contexto);
    }

    const tiempo = AbortSignal.timeout(TIEMPO_MAXIMO_MS);
    let respuesta: GenerateContentResponse;
    try {
      respuesta = await this.generar(contexto, foto, tiempo);
    } catch (error) {
      throw this.traducirError(error, tiempo);
    }

    const sugerencia = validarSugerencia(respuesta.text, contexto.articulos);
    if (!sugerencia) {
      this.logger.error(
        `Gemini gave no usable suggestion (block: ${respuesta.promptFeedback?.blockReason ?? '-'}, finish: ${respuesta.candidates?.[0]?.finishReason ?? '-'})`,
      );
      throw new BadGatewayException('No se pudo armar la sugerencia');
    }
    return { ...sugerencia, simulado: false };
  }

  // The call itself: the photo inline (base64) if there is one, the data as JSON, the fixed
  // instructions and the response schema.
  private generar(
    contexto: ContextoDiagnostico,
    foto: { buffer: Buffer; mime: string } | null,
    abortSignal: AbortSignal,
  ): Promise<GenerateContentResponse> {
    const ai = new GoogleGenAI({
      apiKey: this.configService.getOrThrow<string>('GEMINI_API_KEY'),
    });
    const parts: Part[] = [
      ...(foto
        ? [
            {
              inlineData: {
                mimeType: foto.mime,
                data: foto.buffer.toString('base64'),
              },
            },
          ]
        : []),
      {
        text: `${foto ? 'Foto de ANTES de hoy adjunta.' : 'Sin foto de hoy.'}\nDatos:\n${JSON.stringify(contexto)}`,
      },
    ];
    return ai.models.generateContent({
      model:
        this.configService.get<string>('GEMINI_MODEL') || MODELO_POR_DEFECTO,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: INSTRUCCIONES,
        responseMimeType: 'application/json',
        responseJsonSchema: ESQUEMA,
        // Low, so the same data gives (almost) the same suggestion.
        temperature: 0.2,
        // Flash 3.x models think at MEDIUM by default and can go past the time limit.
        // LOW is the lowest level every Flash 3.x accepts.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal,
      },
    });
  }

  // Gemini's failures as HTTP errors for the front-end. The detail goes to the log, never the key.
  private traducirError(error: unknown, tiempo: AbortSignal): Error {
    if (tiempo.aborted) {
      return new GatewayTimeoutException(
        'La sugerencia tardó demasiado. Probá de nuevo.',
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
