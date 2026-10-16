import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const VERIFICACION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface Destinatario {
  id: number;
  email: string;
  nombre: string;
}

// Email verification (F06). Used on sign-up, email change, resend and when the salon books for an unverified client.
@Injectable()
export class VerificacionEmailService {
  private readonly logger = new Logger(VerificacionEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /** New link token (the previous one stops working). Returns it without hashing, for the email. */
  async nuevoToken(usuarioId: number): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        verificacionToken: hashToken(token),
        verificacionTokenExpira: new Date(Date.now() + VERIFICACION_TTL_MS),
      },
    });
    return token;
  }

  // Not awaited by callers: a slow or failed email must not break the request.
  async enviar(usuario: Destinatario, mensaje: string): Promise<void> {
    try {
      const token = await this.nuevoToken(usuario.id);
      await this.mailService.sendVerificacion(
        usuario.email,
        usuario.nombre,
        token,
        mensaje,
      );
    } catch (error) {
      this.logger.error(
        `Could not send verification email to ${usuario.email}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // Single use: the token is cleared.
  async verificar(token: string): Promise<void> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { verificacionToken: hashToken(token) },
    });
    if (
      !usuario ||
      usuario.fechaBaja !== null ||
      !usuario.verificacionTokenExpira ||
      usuario.verificacionTokenExpira <= new Date()
    ) {
      throw new BadRequestException(
        'El enlace para verificar el email no es válido, ya se usó o venció. Si no figura como verificado, pedí uno nuevo desde tu perfil.',
      );
    }
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        emailVerificadoEn: new Date(),
        verificacionToken: null,
        verificacionTokenExpira: null,
      },
    });
  }
}
