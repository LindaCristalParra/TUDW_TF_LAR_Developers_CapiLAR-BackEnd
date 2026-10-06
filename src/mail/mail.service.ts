import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';

/** Context of templates/turno.hbs. Every field is required (Handlebars runs in strict mode). */
export interface MailTurno {
  titulo: string;
  nombre: string;
  mensaje: string;
  // e.g. "martes 7 de octubre"
  fecha: string;
  horaInicio: string;
  horaFin: string;
  servicios: { horario: string; servicio: string; profesional: string }[];
  // Already formatted, e.g. "miércoles 8 de octubre a las 10:00"
  alternativas: string[];
  boton: string;
  // Front-end path the button opens, e.g. "/mis-turnos"
  ruta: string;
}

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendPasswordReset(
    email: string,
    nombre: string,
    token: string,
  ): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const link = `${frontendUrl}/reset-password?token=${token}`;

    await this.mailerService.sendMail({
      to: email,
      subject: 'Recuperá tu contraseña de CapiLAR',
      template: 'reset-password',
      context: { nombre, link },
    });
  }

  // Every turno notice (request, confirmation, rejection, rescheduling...) uses the same template.
  async sendTurno(
    email: string,
    asunto: string,
    contenido: MailTurno,
  ): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');

    await this.mailerService.sendMail({
      to: email,
      subject: asunto,
      template: 'turno',
      context: { ...contenido, link: `${frontendUrl}${contenido.ruta}` },
    });
  }

  async sendWelcome(email: string, nombre: string): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const link = `${frontendUrl}/login`;

    await this.mailerService.sendMail({
      to: email,
      subject: '¡Bienvenida/o a CapiLAR!',
      template: 'welcome',
      context: { nombre, link },
    });
  }
}
