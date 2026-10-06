import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';

export const FOTO_MAX_BYTES = 2 * 1024 * 1024;

/** The fields of the uploaded file (multer, kept in memory) that are used here. */
export interface ArchivoSubido {
  buffer: Buffer;
  size: number;
}

// Real type from the first bytes, not from the name or the Content-Type the client sends.
const FORMATOS = [
  {
    ext: '.jpg',
    mime: 'image/jpeg',
    es: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: '.png',
    mime: 'image/png',
    es: (b: Buffer) =>
      b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  {
    ext: '.webp',
    mime: 'image/webp',
    es: (b: Buffer) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

// Profile photos on the server's disk. Only the file name is stored in the database.
@Injectable()
export class FotosService implements OnModuleInit {
  private readonly logger = new Logger(FotosService.name);
  private readonly dir: string;

  constructor(configService: ConfigService) {
    this.dir = resolve(configService.get<string>('UPLOADS_DIR') || 'uploads');
  }

  async onModuleInit() {
    await mkdir(this.dir, { recursive: true });
  }

  /** Saves the photo with a random name and returns that name. */
  async guardar(archivo: ArchivoSubido | undefined): Promise<string> {
    if (!archivo || archivo.size === 0) {
      throw new BadRequestException(
        'Mandá la foto en el campo "foto" (multipart/form-data)',
      );
    }
    if (archivo.size > FOTO_MAX_BYTES) {
      throw new BadRequestException('La foto no puede superar los 2 MB');
    }
    const formato = FORMATOS.find((f) => f.es(archivo.buffer));
    if (!formato) {
      throw new BadRequestException('La foto tiene que ser JPG, PNG o WEBP');
    }

    const nombre = `${randomUUID()}${formato.ext}`;
    await writeFile(join(this.dir, nombre), archivo.buffer);
    return nombre;
  }

  /** Removes a photo file. A missing file is not an error: the reference is what matters. */
  async borrar(nombre: string | null | undefined): Promise<void> {
    if (!nombre) {
      return;
    }
    await unlink(join(this.dir, nombre)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error(
          `Could not delete photo ${nombre}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    });
  }

  /** The photo as a response body with its content type. 404 if there is none. */
  async leer(nombre: string | null | undefined): Promise<StreamableFile> {
    const formato = FORMATOS.find((f) => f.ext === extname(nombre ?? ''));
    const ruta = join(this.dir, nombre ?? '');
    if (!nombre || !formato || !(await this.existe(ruta))) {
      throw new NotFoundException('No tiene foto de perfil');
    }
    return new StreamableFile(createReadStream(ruta), {
      type: formato.mime,
      disposition: 'inline',
    });
  }

  private existe(ruta: string): Promise<boolean> {
    return access(ruta).then(
      () => true,
      () => false,
    );
  }
}
