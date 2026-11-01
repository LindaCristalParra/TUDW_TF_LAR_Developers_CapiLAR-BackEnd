import { Module } from '@nestjs/common';
import { FichasModule } from '../fichas/fichas.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AgendaDiariaCron } from './agenda-diaria.cron';
import { ClientesTurnosController } from './clientes-turnos.controller';
import { RecordatoriosCron } from './recordatorios.cron';
import { TurnosController } from './turnos.controller';
import { TurnosService } from './turnos.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

@Module({
  imports: [FichasModule, MailModule, UsersModule, WhatsAppModule],
  controllers: [
    TurnosController,
    ClientesTurnosController,
    WhatsAppWebhookController,
  ],
  providers: [TurnosService, RecordatoriosCron, AgendaDiariaCron],
})
export class TurnosModule {}
