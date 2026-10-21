import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'path';
import { MailService } from './mail.service';

const MINUSCULAS = ['de', 'a', 'las'];

/** Templates' {{fechaTitulo x}}: "viernes, 23 de octubre a las 10:00" -> "Viernes 23 de Octubre a las 10:00". */
function fechaTitulo(texto: string): string {
  // Intl puts a comma after the weekday.
  return texto
    .replace(',', '')
    .replace(/\p{L}+/gu, (palabra) =>
      MINUSCULAS.includes(palabra)
        ? palabra
        : palabra[0].toUpperCase() + palabra.slice(1),
    );
}

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.getOrThrow<string>('SMTP_HOST'),
          port: Number(configService.getOrThrow<string>('SMTP_PORT')),
          secure: true,
          auth: {
            user: configService.getOrThrow<string>('SMTP_USER'),
            pass: configService.getOrThrow<string>('SMTP_PASS'),
          },
        },
        defaults: {
          from: configService.getOrThrow<string>('MAIL_FROM'),
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new HandlebarsAdapter({ fechaTitulo }),
          options: { strict: true },
        },
      }),
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
