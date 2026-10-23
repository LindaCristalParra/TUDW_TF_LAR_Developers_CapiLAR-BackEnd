import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GenerateContentResponse } from '@google/genai';
import {
  DiagnosticoService,
  SUGERENCIA_SIMULADA,
  validarSugerencia,
} from './diagnostico.service';

// ConfigService with only the given variables.
function configCon(variables: Record<string, string>): ConfigService {
  return new ConfigService(variables);
}

const FOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

// The private Gemini call, replaced in the tests so nothing goes out to Google.
type ConGenerar = { generar: DiagnosticoService['sugerir'] };

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

describe('validarSugerencia', () => {
  it('keeps the fields with valid values', () => {
    const texto = JSON.stringify({
      porosidad: 'ALTA',
      elasticidad: 'BAJA',
      porcentajeCanas: 25,
      tipoDePelo: 'RIZADO',
      volumenDePelo: 'FINO',
      observaciones: '  Puntas abiertas.  ',
    });

    expect(validarSugerencia(texto)).toEqual({
      porosidad: 'ALTA',
      elasticidad: 'BAJA',
      porcentajeCanas: 25,
      tipoDePelo: 'RIZADO',
      volumenDePelo: 'FINO',
      observaciones: 'Puntas abiertas.',
    });
  });

  it('drops values outside their enum or range', () => {
    const texto = JSON.stringify({
      porosidad: 'MUY_ALTA',
      elasticidad: 'media',
      porcentajeCanas: 150,
      tipoDePelo: 'CRESPO',
      volumenDePelo: 'MEDIO',
      observaciones: 42,
      extra: 'no va',
    });

    expect(validarSugerencia(texto)).toEqual({ volumenDePelo: 'MEDIO' });
  });

  it('drops a negative or non-numeric gray percentage and rounds decimals', () => {
    expect(
      validarSugerencia('{"porcentajeCanas":-5,"porosidad":"BAJA"}'),
    ).toEqual({ porosidad: 'BAJA' });
    expect(validarSugerencia('{"porcentajeCanas":"30"}')).toBeNull();
    expect(validarSugerencia('{"porcentajeCanas":12.6}')).toEqual({
      porcentajeCanas: 13,
    });
  });

  it('returns null for empty, broken or non-object answers', () => {
    expect(validarSugerencia(undefined)).toBeNull();
    expect(validarSugerencia('')).toBeNull();
    expect(validarSugerencia('{"porosidad": "ALTA"')).toBeNull();
    expect(validarSugerencia('["ALTA"]')).toBeNull();
    expect(validarSugerencia('null')).toBeNull();
  });

  it('returns null when no field is valid', () => {
    expect(validarSugerencia('{"porosidad":"X","tipoDePelo":1}')).toBeNull();
  });
});

describe('DiagnosticoService', () => {
  describe('GEMINI_MODO=simulado', () => {
    it('returns the fixed suggestion flagged as simulated', async () => {
      const service = new DiagnosticoService(
        configCon({ GEMINI_MODO: 'simulado' }),
      );

      const sugerencia = await service.sugerir(FOTO, 'image/jpeg');

      expect(sugerencia).toEqual(SUGERENCIA_SIMULADA);
      expect(sugerencia.simulado).toBe(true);
    });

    it('does not need the Gemini key', async () => {
      const service = new DiagnosticoService(
        configCon({ GEMINI_MODO: 'simulado' }),
      );

      await expect(service.sugerir(FOTO, 'image/jpeg')).resolves.toBeDefined();
    });
  });

  describe('GEMINI_MODO=real', () => {
    it('returns the validated suggestion, not simulated', async () => {
      const generar = jest
        .fn()
        .mockResolvedValue(
          respuesta(
            '{"porosidad":"MEDIA","tipoDePelo":"LISO","volumenDePelo":"OTRO"}',
          ),
        );
      const service = serviceReal(generar);

      await expect(service.sugerir(FOTO, 'image/png')).resolves.toEqual({
        porosidad: 'MEDIA',
        tipoDePelo: 'LISO',
        simulado: false,
      });
      expect(generar).toHaveBeenCalledWith(
        FOTO,
        'image/png',
        expect.any(AbortSignal),
      );
    });

    it('answers 502 when Gemini gives nothing usable (empty or blocked)', async () => {
      const service = serviceReal(
        jest.fn().mockResolvedValue(respuesta(undefined)),
      );

      await expect(service.sugerir(FOTO, 'image/jpeg')).rejects.toThrow(
        new BadGatewayException('No se pudo analizar la foto'),
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

      await expect(service.sugerir(FOTO, 'image/jpeg')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
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

      await expect(service.sugerir(FOTO, 'image/jpeg')).rejects.toBeInstanceOf(
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

      await expect(service.sugerir(FOTO, 'image/jpeg')).rejects.toBeInstanceOf(
        GatewayTimeoutException,
      );
    });
  });
});
