import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VistaPreviaColorDto } from './dto/preview-color.dto';

// YouCam API (Perfect Corp), v2: https://docs.perfectcorp.com/reference/ai_hair_color
const YOUCAM_URL = 'https://yce-api-01.makeupar.com/s2s/v2.0';

// The task is checked every 2 s, up to 30 times (60 s).
const ESPERA_CONSULTA_MS = 2000;
const MAX_CONSULTAS = 30;
// Each HTTP call to YouCam (upload included).
const TIMEOUT_LLAMADA_MS = 30_000;
// YouCam keeps the result for 2 hours.
const VIGENCIA_MS = 2 * 60 * 60 * 1000;
const DEMORA_SIMULADO_MS = 1500;
const INTENSIDAD_POR_DEFECTO = 80;

const NO_DISPONIBLE = 'La prueba de color no está disponible en este momento';
const FALLO = 'No se pudo aplicar el color. Probá de nuevo.';

export type FormatoImagen = 'image/jpeg' | 'image/png';

/**
 * Real type from the first bytes (YouCam only takes JPG and PNG, not WEBP).
 * null for anything else.
 */
export function formatoImagen(buffer: Buffer): FormatoImagen | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  return null;
}

// Engine errors of a finished task that depend on the photo: the client can fix them with another one.
const ERRORES_DE_FOTO: Record<string, string> = {
  error_below_min_image_size:
    'La foto es muy chica: tiene que medir al menos 320 × 320 px.',
  error_exceed_max_image_size:
    'La foto es muy grande: tiene que medir menos de 1920 px de ancho y 1080 px de alto.',
  exceed_max_filesize: 'La foto es muy pesada. Probá con otra.',
  error_decode_image: 'No se pudo leer la foto. Probá con otra.',
  error_nsfw_content_detected:
    'La foto no se puede usar. Probá con una selfie de frente.',
  // The engine fails like this when it finds no face or no hair.
  error_inference:
    'No encontramos una cara o el pelo en la foto. Probá con una de frente, con buena luz y el pelo visible.',
};
const SIN_CARA_O_PELO = ERRORES_DE_FOTO.error_inference;

interface RespuestaYouCam<T> {
  status?: number;
  data?: T;
  error?: string;
  error_code?: string;
}

interface ArchivoCreado {
  files?: {
    file_id?: string;
    requests?: {
      url?: string;
      headers?: Record<string, string | number>;
    }[];
  }[];
}

interface EstadoTarea {
  task_status?: 'running' | 'success' | 'error';
  error?: string | null;
  error_message?: string;
  results?: { url?: string };
}

const esperar = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Virtual hair color try-on (TP3, API 1). The selfie is only kept in memory:
// it is sent to YouCam and never saved to disk or to the database.
@Injectable()
export class HairColorService {
  private readonly logger = new Logger(HairColorService.name);

  constructor(private readonly configService: ConfigService) {}

  /** With YOUCAM_MODO=simulado it doesn't call YouCam (to develop without spending units). */
  async preview(
    buffer: Buffer,
    mime: FormatoImagen,
    color: string,
    intensidad = INTENSIDAD_POR_DEFECTO,
  ): Promise<VistaPreviaColorDto> {
    const simulado =
      this.configService.get<string>('YOUCAM_MODO') === 'simulado';
    const url = simulado
      ? await this.simular(buffer, mime)
      : await this.aplicarColor(buffer, mime, color, intensidad);
    return {
      url,
      venceEn: new Date(Date.now() + VIGENCIA_MS).toISOString(),
      simulado,
    };
  }

  /** The same selfie as a data: URL, after a short wait like the real one. */
  private async simular(buffer: Buffer, mime: FormatoImagen): Promise<string> {
    await esperar(DEMORA_SIMULADO_MS);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  /** The 4 steps of the YouCam v2 API: create file, upload it, run the task, check it. */
  private async aplicarColor(
    buffer: Buffer,
    mime: FormatoImagen,
    color: string,
    intensidad: number,
  ): Promise<string> {
    const archivo = await this.llamar<ArchivoCreado>('/file', {
      method: 'POST',
      body: JSON.stringify({
        files: [
          {
            content_type: mime,
            file_name: mime === 'image/png' ? 'selfie.png' : 'selfie.jpg',
            file_size: buffer.length,
          },
        ],
      }),
    });
    const fileId = archivo.files?.[0]?.file_id;
    const subida = archivo.files?.[0]?.requests?.[0];
    if (!fileId || !subida?.url) {
      this.logger.error('YouCam file: response without file_id or upload url');
      throw new BadGatewayException(FALLO);
    }

    await this.subir(subida.url, subida.headers, buffer);

    const tarea = await this.llamar<{ task_id?: string }>('/task/hair-color', {
      method: 'POST',
      body: JSON.stringify({
        src_file_id: fileId,
        pattern: { name: 'full' },
        palettes: [{ color, color_intensity: intensidad }],
      }),
    });
    if (!tarea.task_id) {
      this.logger.error('YouCam hair-color: response without task_id');
      throw new BadGatewayException(FALLO);
    }

    return this.esperarResultado(tarea.task_id);
  }

  /** PUT of the bytes to the signed URL, with the headers YouCam asks for. */
  private async subir(
    url: string,
    headers: Record<string, string | number> = {},
    buffer: Buffer,
  ): Promise<void> {
    // fetch sets Content-Length from the body.
    const encabezados = Object.fromEntries(
      Object.entries(headers)
        .filter(([nombre]) => nombre.toLowerCase() !== 'content-length')
        .map(([nombre, valor]) => [nombre, String(valor)]),
    );
    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: 'PUT',
        headers: encabezados,
        body: new Uint8Array(buffer),
        signal: AbortSignal.timeout(TIMEOUT_LLAMADA_MS),
      });
    } catch (error) {
      throw this.errorDeRed('upload', error);
    }
    if (!respuesta.ok) {
      this.logger.error(`YouCam upload: HTTP ${respuesta.status}`);
      throw new BadGatewayException(FALLO);
    }
  }

  private async esperarResultado(taskId: string): Promise<string> {
    for (let consulta = 0; consulta < MAX_CONSULTAS; consulta++) {
      await esperar(ESPERA_CONSULTA_MS);
      const estado = await this.llamar<EstadoTarea>(
        `/task/hair-color/${encodeURIComponent(taskId)}`,
        { method: 'GET' },
      );

      if (estado.task_status === 'success') {
        if (!estado.results?.url) {
          this.logger.error('YouCam hair-color: success without results.url');
          throw new BadGatewayException(FALLO);
        }
        return estado.results.url;
      }
      if (estado.task_status === 'error') {
        throw this.errorDeTarea(estado);
      }
    }
    throw new GatewayTimeoutException(
      'El color tardó demasiado. Probá de nuevo.',
    );
  }

  private errorDeTarea(estado: EstadoTarea): HttpException {
    const codigo = estado.error ?? '';
    const mensaje =
      ERRORES_DE_FOTO[codigo] ??
      // The docs don't list a code for "no face / no hair"; look for it in the code itself.
      (/face|hair/i.test(codigo) ? SIN_CARA_O_PELO : undefined);
    if (mensaje) {
      return new BadRequestException(mensaje);
    }
    this.logger.error(
      `YouCam hair-color task error: ${codigo || 'no code'} ${estado.error_message ?? ''}`,
    );
    return new BadGatewayException(FALLO);
  }

  /** Call to the YouCam API with the key. Returns `data` or throws the HTTP error for our client. */
  private async llamar<T>(ruta: string, init: RequestInit): Promise<T> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${YOUCAM_URL}${ruta}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.configService.getOrThrow<string>('PERFECT_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(TIMEOUT_LLAMADA_MS),
      });
    } catch (error) {
      throw this.errorDeRed(ruta, error);
    }

    const cuerpo = (await respuesta
      .json()
      .catch(() => ({}))) as RespuestaYouCam<T>;
    if (respuesta.ok && cuerpo.data) {
      return cuerpo.data;
    }

    const detalle = `YouCam ${ruta}: HTTP ${respuesta.status} ${cuerpo.error_code ?? ''} ${cuerpo.error ?? ''}`;
    if (respuesta.status === 429) {
      this.logger.warn(detalle);
      throw new ServiceUnavailableException(
        'La prueba de color está muy pedida. Probá en un minuto.',
      );
    }
    // Rejected key (401) or no units left (CreditInsufficiency): our problem, not the client's.
    this.logger.error(detalle);
    if (
      respuesta.status === 401 ||
      respuesta.status === 403 ||
      cuerpo.error_code === 'CreditInsufficiency'
    ) {
      throw new BadGatewayException(NO_DISPONIBLE);
    }
    throw new BadGatewayException(FALLO);
  }

  private errorDeRed(paso: string, error: unknown): HttpException {
    if (error instanceof Error && error.name === 'TimeoutError') {
      this.logger.error(
        `YouCam ${paso}: no answer in ${TIMEOUT_LLAMADA_MS} ms`,
      );
      return new GatewayTimeoutException(
        'El color tardó demasiado. Probá de nuevo.',
      );
    }
    this.logger.error(
      `YouCam ${paso}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new BadGatewayException(NO_DISPONIBLE);
  }
}
