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
  // Optional second button (e.g. the reminder's "NO PUEDO IR"); "" hides it.
  botonSecundario: string;
  rutaSecundaria: string;
}

/** One turno of a professional's daily agenda (templates/agenda-diaria.hbs). */
export interface TurnoAgendaDiaria {
  // e.g. "10:00–11:30": only this professional's services
  horario: string;
  cliente: string;
  telefono: string;
  servicios: string;
  // "" when the client has none
  alergia: string;
}

/** Context of templates/agenda-diaria.hbs. Only non-empty groups are sent. */
export interface MailAgendaDiaria {
  nombre: string;
  // e.g. "martes 7 de octubre"
  fecha: string;
  grupos: { titulo: string; color: string; turnos: TurnoAgendaDiaria[] }[];
}

/** Context of templates/serie.hbs (F05): the dates of a series, one line each. */
export interface MailSerie {
  titulo: string;
  nombre: string;
  mensaje: string;
  // e.g. "Corte con Flor Fichera, cada semana a las 10:00"
  resumen: string;
  // fecha e.g. "martes 8 de octubre"; detalle e.g. "10:00 · Confirmado"
  fechas: { fecha: string; detalle: string }[];
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
      context: {
        ...contenido,
        link: `${frontendUrl}${contenido.ruta}`,
        linkSecundario: contenido.rutaSecundaria
          ? `${frontendUrl}${contenido.rutaSecundaria}`
          : '',
      },
    });
  }

  async sendSerie(
    email: string,
    asunto: string,
    contenido: MailSerie,
  ): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');

    await this.mailerService.sendMail({
      to: email,
      subject: asunto,
      template: 'serie',
      context: { ...contenido, link: `${frontendUrl}${contenido.ruta}` },
    });
  }

  async sendAgendaDiaria(
    email: string,
    contenido: MailAgendaDiaria,
  ): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');

    await this.mailerService.sendMail({
      to: email,
      subject: `Tu agenda de mañana, ${contenido.fecha}`,
      template: 'agenda-diaria',
      context: { ...contenido, link: `${frontendUrl}/panel/agenda` },
    });
  }

  // Includes the email verification link (token without hashing).
  async sendWelcome(
    email: string,
    nombre: string,
    tokenVerificacion: string,
  ): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');

    await this.mailerService.sendMail({
      to: email,
      subject: '¡Bienvenida/o a CapiLAR!',
      template: 'welcome',
      context: {
        nombre,
        link: this.linkVerificacion(tokenVerificacion),
        linkLogin: `${frontendUrl}/login`,
      },
    });
  }

  // Resend, email change or a turno booked by the salon: `mensaje` says why it arrives.
  async sendVerificacion(
    email: string,
    nombre: string,
    token: string,
    mensaje: string,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Verificá tu email de CapiLAR',
      template: 'verificar-email',
      context: { nombre, mensaje, link: this.linkVerificacion(token) },
    });
  }

  private linkVerificacion(token: string): string {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    return `${frontendUrl}/verificar-email?token=${token}`;
  }
}
