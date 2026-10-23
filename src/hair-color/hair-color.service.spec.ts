import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PreviewColorDto } from './dto/preview-color.dto';
import { formatoImagen, HairColorService } from './hair-color.service';

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP'),
]);

function servicio(variables: Record<string, string>) {
  const config = {
    get: (nombre: string) => variables[nombre],
    getOrThrow: (nombre: string) => {
      if (!variables[nombre]) throw new Error(`${nombre} missing`);
      return variables[nombre];
    },
  } as unknown as ConfigService;
  return new HairColorService(config);
}

// A YouCam JSON answer, as fetch would return it.
const respuesta = (status: number, cuerpo: unknown) =>
  ({
    ok: status < 300,
    status,
    json: () => Promise.resolve(cuerpo),
  }) as Response;

const archivoCreado = respuesta(200, {
  status: 200,
  data: {
    files: [
      {
        file_id: 'file-1',
        requests: [
          {
            url: 'https://upload.example.com/signed',
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg', 'Content-Length': 7 },
          },
        ],
      },
    ],
  },
});
const subido = respuesta(200, {});
const tareaCreada = respuesta(200, {
  status: 200,
  data: { task_id: 'task-1' },
});
const enCurso = respuesta(200, {
  status: 200,
  data: { task_status: 'running' },
});

describe('formatoImagen', () => {
  it('detects JPG and PNG by their first bytes', () => {
    expect(formatoImagen(JPG)).toBe('image/jpeg');
    expect(formatoImagen(PNG)).toBe('image/png');
  });

  it('rejects WEBP and anything else', () => {
    expect(formatoImagen(WEBP)).toBeNull();
    expect(formatoImagen(Buffer.from('hola'))).toBeNull();
  });
});

describe('PreviewColorDto', () => {
  // Same options as the global pipe in main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const validar = (cuerpo: object) =>
    pipe.transform(cuerpo, { type: 'body', metatype: PreviewColorDto });

  it('accepts a hex color and turns the intensity text into a number', async () => {
    await expect(
      validar({ color: '#8B6542', intensidad: '60' }),
    ).resolves.toEqual({
      color: '#8B6542',
      intensidad: 60,
    });
  });

  it.each([{ color: 'rojo' }, { color: '#8B654' }, { color: '8B6542' }, {}])(
    'rejects an invalid or missing color (%p) with 400',
    async (cuerpo) => {
      await expect(validar(cuerpo)).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects an intensity out of 0 to 100', async () => {
    await expect(
      validar({ color: '#8B6542', intensidad: '101' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('HairColorService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.useRealTimers();
    fetchMock.mockRestore();
  });

  describe('simulated mode', () => {
    it('returns the same selfie as a data URL without calling YouCam', async () => {
      const promesa = servicio({ YOUCAM_MODO: 'simulado' }).preview(
        JPG,
        'image/jpeg',
        '#8B6542',
      );
      await jest.advanceTimersByTimeAsync(1500);
      const resultado = await promesa;

      expect(resultado.simulado).toBe(true);
      expect(resultado.url).toBe(
        `data:image/jpeg;base64,${JPG.toString('base64')}`,
      );
      const horas = (Date.parse(resultado.venceEn) - Date.now()) / 3_600_000;
      expect(horas).toBeCloseTo(2);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('real mode', () => {
    const real = () =>
      servicio({ YOUCAM_MODO: 'real', PERFECT_API_KEY: 'test-key' });

    // Lets the polling run without waiting 2 s each time.
    async function terminar<T>(promesa: Promise<T>): Promise<T> {
      const capturada = promesa.catch((error: unknown) => error);
      await jest.runAllTimersAsync();
      const resultado = await capturada;
      if (resultado instanceof Error) throw resultado;
      return resultado as T;
    }

    it('uploads the selfie, runs the task and returns the result url', async () => {
      fetchMock
        .mockResolvedValueOnce(archivoCreado)
        .mockResolvedValueOnce(subido)
        .mockResolvedValueOnce(tareaCreada)
        .mockResolvedValueOnce(enCurso)
        .mockResolvedValueOnce(
          respuesta(200, {
            data: {
              task_status: 'success',
              results: { url: 'https://result.example.com/1.jpg' },
            },
          }),
        );

      const resultado = await terminar(
        real().preview(JPG, 'image/jpeg', '#8B6542', 60),
      );

      expect(resultado).toMatchObject({
        url: 'https://result.example.com/1.jpg',
        simulado: false,
      });
      const [, init] = fetchMock.mock.calls[2] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        src_file_id: 'file-1',
        pattern: { name: 'full' },
        palettes: [{ color: '#8B6542', color_intensity: 60 }],
      });
      expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    });

    it('turns a photo error of the task into a 400', async () => {
      fetchMock
        .mockResolvedValueOnce(archivoCreado)
        .mockResolvedValueOnce(subido)
        .mockResolvedValueOnce(tareaCreada)
        .mockResolvedValueOnce(
          respuesta(200, {
            data: { task_status: 'error', error: 'error_below_min_image_size' },
          }),
        );

      await expect(
        terminar(real().preview(JPG, 'image/jpeg', '#8B6542')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('answers 502 when the account has no units left', async () => {
      fetchMock.mockResolvedValueOnce(
        respuesta(400, { status: 400, error_code: 'CreditInsufficiency' }),
      );

      await expect(
        terminar(real().preview(JPG, 'image/jpeg', '#8B6542')),
      ).rejects.toThrow(
        new BadGatewayException(
          'La prueba de color no está disponible en este momento',
        ),
      );
    });

    it('answers 503 when YouCam limits the requests (429)', async () => {
      fetchMock.mockResolvedValueOnce(respuesta(429, {}));

      await expect(
        terminar(real().preview(JPG, 'image/jpeg', '#8B6542')),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('gives up with 504 after 30 checks', async () => {
      fetchMock
        .mockResolvedValueOnce(archivoCreado)
        .mockResolvedValueOnce(subido)
        .mockResolvedValueOnce(tareaCreada)
        .mockResolvedValue(enCurso);

      await expect(
        terminar(real().preview(JPG, 'image/jpeg', '#8B6542')),
      ).rejects.toBeInstanceOf(GatewayTimeoutException);
      // file + upload + task + 30 checks
      expect(fetchMock).toHaveBeenCalledTimes(33);
    });
  });
});
