import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable, of } from 'rxjs';
import { FOTO_MAX_BYTES } from './fotos.service';

// Nest's FileInterceptor for the "foto" field (kept in memory, up to 2 MB).
const MulterFoto = FileInterceptor('foto', {
  limits: { fileSize: FOTO_MAX_BYTES, files: 1 },
});

// Runs multer first and turns only its English errors into messages for the
// front-end; errors from the handler pass through untouched.
@Injectable()
export class SubirFotoInterceptor implements NestInterceptor {
  private readonly multer = new MulterFoto();

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      await this.multer.intercept(context, { handle: () => of(undefined) });
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new BadRequestException('La foto no puede superar los 2 MB');
      }
      // Wrong field name, more than one file, broken multipart body...
      throw new BadRequestException(
        'Mandá una sola foto en el campo "foto" (multipart/form-data)',
      );
    }
    return next.handle();
  }
}
