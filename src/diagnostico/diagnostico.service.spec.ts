import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GenerateContentResponse } from '@google/genai';
import { ArticuloDisponible, ContextoDiagnostico } from './contexto';
import {
  DiagnosticoService,
  sugerenciaSimulada,
  validarSugerencia,
} from './diagnostico.service';

// ConfigService with only the given variables.
function configCon(variables: Record<string, string>): ConfigService {
  return new ConfigService(variables);
}

const FOTO = {
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  mime: 'image/jpeg',
};

const TINTURA: ArticuloDisponible = {
  id: 7,
  nombre: 'Tintura 7.1',
  marca: 'Question Professional Color',
  tonalidad: '7.1',
  tipoProducto: 'TINTURA',
  unidad: 'G',
};
const OXIDANTE: ArticuloDisponible = {
  id: 9,
  nombre: 'Oxidante 20 vol',
  marca: 'Livesolut',
  tonalidad: '20vol',
  tipoProducto: 'OXIDANTE',
  unidad: 'ML',
};

function contexto(
  parcial: Partial<ContextoDiagnostico> = {},
): ContextoDiagnostico {
  return {
    fichaActual: {
      fecha: '2026-11-22',
      servicio: 'Retoque de Color',
      porosidad: null,
      elasticidad: null,
      porcentajeCanas: null,
      tipoDePelo: null,
      volumenDePelo: null,
      tratamientosPrevios: null,
      observacionesInternas: null,
    },
    alergias: [],
    fichasAnteriores: [],
    articulos: [TINTURA, OXIDANTE],
    ...parcial,
  };
}

// The private Gemini call, replaced in the tests so nothing goes out to Google.
type ConGenerar = { generar: jest.Mock };

function serviceReal(generar: jest.Mock): DiagnosticoService {
  const service = new DiagnosticoService(
    configCon({ GEMINI_MODO: 'real', GEMINI_API_KEY: 'test' }),
  );
  (service as unknown as ConGenerar).generar = generar;
  return service;
}

function respuesta(text: string | undefined): GenerateContentResponse {
  return { text } as GenerateContentResponse;
}

const ANALISIS_VACIO = { analisis: { alertas: [] }, formulas: [] };

describe('validarSugerencia', () => {
  const articulos = [TINTURA, OXIDANTE];

  it('keeps the diagnosis fields with valid values', () => {
    const texto = JSON.stringify({
      porosidad: 'ALTA',
      elasticidad: 'BAJA',
      porcentajeCanas: 25,
      tipoDePelo: 'RIZADO',
      volumenDePelo: 'FINO',
      ...ANALISIS_VACIO,
    });

    expect(validarSugerencia(texto, articulos)).toEqual({
      porosidad: 'ALTA',
      elasticidad: 'BAJA',
      porcentajeCanas: 25,
      tipoDePelo: 'RIZADO',
      volumenDePelo: 'FINO',
      analisis: { alertas: [] },
      formulas: [],
    });
  });

  it('drops values outside their enum or range', () => {
    const texto = JSON.stringify({
      porosidad: 'MUY_ALTA',
      elasticidad: 'media',
      porcentajeCanas: 150,
      tipoDePelo: 'CRESPO',
      volumenDePelo: 'MEDIO',
      extra: 'no va',
      ...ANALISIS_VACIO,
    });

    expect(validarSugerencia(texto, articulos)).toEqual({
      volumenDePelo: 'MEDIO',
      analisis: { alertas: [] },
      formulas: [],
    });
  });

  it('drops a negative or non-numeric gray percentage and rounds decimals', () => {
    expect(
      validarSugerencia('{"porcentajeCanas":-5,"porosidad":"BAJA"}', articulos),
    ).toMatchObject({ porosidad: 'BAJA' });
    expect(
      validarSugerencia('{"porcentajeCanas":-5,"porosidad":"BAJA"}', articulos),
    ).not.toHaveProperty('porcentajeCanas');
    expect(validarSugerencia('{"porcentajeCanas":"30"}', articulos)).toBeNull();
    expect(
      validarSugerencia('{"porcentajeCanas":12.6}', articulos),
    ).toMatchObject({ porcentajeCanas: 13 });
  });

  it('trims the analysis and keeps only text alerts', () => {
    const texto = JSON.stringify({
      analisis: {
        evolucion: '  Porosidad en aumento.  ',
        alertas: [
          'Alergia al amoníaco.',
          3,
          '  ',
          'Decoloración hace 2 semanas.',
        ],
        recomendacion: 42,
      },
      formulas: [],
    });

    expect(validarSugerencia(texto, articulos)).toEqual({
      analisis: {
        evolucion: 'Porosidad en aumento.',
        alertas: ['Alergia al amoníaco.', 'Decoloración hace 2 semanas.'],
      },
      formulas: [],
    });
  });

  it('caps the alerts and the text lengths', () => {
    const texto = JSON.stringify({
      analisis: {
        evolucion: 'x'.repeat(2000),
        alertas: Array.from({ length: 10 }, (_, i) => `alerta ${i}`),
      },
    });

    const s = validarSugerencia(texto, articulos);
    expect(s?.analisis.evolucion).toHaveLength(1000);
    expect(s?.analisis.alertas).toHaveLength(6);
  });

  it('fills the formula items from the stock list and ignores what the model says about them', () => {
    const texto = JSON.stringify({
      analisis: { alertas: [] },
      formulas: [
        {
          descripcion: ' Raíz ',
          oxidanteVolumen: 20,
          tiempoPoseMin: 35,
          insumos: [
            {
              articuloId: 7,
              cantidad: 30.456,
              producto: 'Otra cosa',
              unidad: 'ML',
            },
            { articuloId: 9, cantidad: 45 },
          ],
        },
      ],
    });

    expect(validarSugerencia(texto, articulos)?.formulas).toEqual([
      {
        descripcion: 'Raíz',
        oxidanteVolumen: 20,
        tiempoPoseMin: 35,
        insumos: [
          {
            articuloId: 7,
            producto: 'Tintura 7.1',
            marca: 'Question Professional Color',
            tono: '7.1',
            cantidad: 30.46,
            unidad: 'G',
          },
          {
            articuloId: 9,
            producto: 'Oxidante 20 vol',
            marca: 'Livesolut',
            tono: '20vol',
            cantidad: 45,
            unidad: 'ML',
          },
        ],
      },
    ]);
  });

  it('drops items not in stock, repeated, or with a bad quantity, and empty formulas', () => {
    const texto = JSON.stringify({
      analisis: { alertas: [] },
      formulas: [
        {
          oxidanteVolumen: 90,
          tiempoPoseMin: 0,
          insumos: [
            { articuloId: 999, cantidad: 10 },
            { articuloId: '7', cantidad: 10 },
            { articuloId: 7, cantidad: 0 },
            { articuloId: 7, cantidad: -3 },
            { articuloId: 7, cantidad: '30' },
            { articuloId: 7, cantidad: 30 },
            { articuloId: 7, cantidad: 40 },
          ],
        },
        { insumos: [{ articuloId: 999, cantidad: 10 }] },
        'no es un objeto',
      ],
    });

    expect(validarSugerencia(texto, articulos)?.formulas).toEqual([
      {
        insumos: [expect.objectContaining({ articuloId: 7, cantidad: 30 })],
      },
    ]);
  });

  it('keeps at most 5 formulas', () => {
    const formula = { insumos: [{ articuloId: 7, cantidad: 10 }] };
    const texto = JSON.stringify({
      analisis: { alertas: [] },
      formulas: Array.from({ length: 8 }, () => formula),
    });

    expect(validarSugerencia(texto, articulos)?.formulas).toHaveLength(5);
  });

  it('returns null for empty, broken or non-object answers', () => {
    expect(validarSugerencia(undefined, articulos)).toBeNull();
    expect(validarSugerencia('', articulos)).toBeNull();
    expect(validarSugerencia('{"porosidad": "ALTA"', articulos)).toBeNull();
    expect(validarSugerencia('["ALTA"]', articulos)).toBeNull();
    expect(validarSugerencia('null', articulos)).toBeNull();
  });

  it('returns null when nothing is usable', () => {
    expect(
      validarSugerencia(
        '{"porosidad":"X","tipoDePelo":1,"analisis":{"alertas":[]},"formulas":[{"insumos":[{"articuloId":999,"cantidad":1}]}]}',
        articulos,
      ),
    ).toBeNull();
  });
});

describe('sugerenciaSimulada', () => {
  it('uses the first dye and developer in stock and lists the allergies', () => {
    const s = sugerenciaSimulada(contexto({ alergias: ['Amoníaco'] }));

    expect(s.simulado).toBe(true);
    expect(s.analisis.alertas).toEqual(['Alergia: Amoníaco.']);
    expect(s.formulas[0].insumos.map((i) => i.articuloId)).toEqual([7, 9]);
  });

  it('has no formula without items in stock', () => {
    expect(sugerenciaSimulada(contexto({ articulos: [] })).formulas).toEqual(
      [],
    );
  });
});

describe('DiagnosticoService', () => {
  describe('GEMINI_MODO=simulado', () => {
    it('returns the fixed suggestion without the Gemini key', async () => {
      const service = new DiagnosticoService(
        configCon({ GEMINI_MODO: 'simulado' }),
      );

      const sugerencia = await service.sugerir(contexto(), FOTO);

      expect(sugerencia).toEqual(sugerenciaSimulada(contexto()));
      expect(sugerencia.simulado).toBe(true);
    });
  });

  describe('GEMINI_MODO=real', () => {
    it('returns the validated suggestion, not simulated', async () => {
      const generar = jest
        .fn()
        .mockResolvedValue(
          respuesta(
            '{"porosidad":"MEDIA","tipoDePelo":"LISO","volumenDePelo":"OTRO","analisis":{"alertas":[]},"formulas":[]}',
          ),
        );
      const service = serviceReal(generar);
      const ctx = contexto();

      await expect(service.sugerir(ctx, null)).resolves.toEqual({
        porosidad: 'MEDIA',
        tipoDePelo: 'LISO',
        analisis: { alertas: [] },
        formulas: [],
        simulado: false,
      });
      expect(generar).toHaveBeenCalledWith(ctx, null, expect.any(AbortSignal));
    });

    it('answers 502 when Gemini gives nothing usable (empty or blocked)', async () => {
      const service = serviceReal(
        jest.fn().mockResolvedValue(respuesta(undefined)),
      );

      await expect(service.sugerir(contexto(), FOTO)).rejects.toThrow(
        new BadGatewayException('No se pudo armar la sugerencia'),
      );
    });

    it('answers 503 when Gemini hits the rate limit (429)', async () => {
      const service = serviceReal(
        jest
          .fn()
          .mockRejectedValue(
            new ApiError({ message: 'RESOURCE_EXHAUSTED', status: 429 }),
          ),
      );

      await expect(service.sugerir(contexto(), FOTO)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('answers 503 when the model is overloaded on Google (503)', async () => {
      const service = serviceReal(
        jest
          .fn()
          .mockRejectedValue(
            new ApiError({ message: 'high demand', status: 503 }),
          ),
      );

      await expect(service.sugerir(contexto(), FOTO)).rejects.toThrow(
        new ServiceUnavailableException(
          'El asistente de IA está ocupado. Probá en un minuto.',
        ),
      );
    });

    it('answers 502 on any other Gemini error', async () => {
      const service = serviceReal(
        jest
          .fn()
          .mockRejectedValue(
            new ApiError({ message: 'API key not valid', status: 400 }),
          ),
      );

      await expect(service.sugerir(contexto(), FOTO)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('answers 504 when the call runs out of time', async () => {
      // The signal the service passes is already aborted when the call fails.
      const service = serviceReal(
        jest.fn().mockImplementation(() => Promise.reject(new Error('abort'))),
      );
      jest
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValueOnce(AbortSignal.abort());

      await expect(service.sugerir(contexto(), FOTO)).rejects.toBeInstanceOf(
        GatewayTimeoutException,
      );
    });
  });
});
