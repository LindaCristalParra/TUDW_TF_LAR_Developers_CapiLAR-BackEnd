import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AgendaDiariaCron } from './agenda-diaria.cron';
import { RecordatoriosCron } from './recordatorios.cron';
import { TurnosController } from './turnos.controller';
import { TurnosService } from './turnos.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

@Module({
  imports: [MailModule, UsersModule, WhatsAppModule],
  controllers: [TurnosController, WhatsAppWebhookController],
  providers: [TurnosService, RecordatoriosCron, AgendaDiariaCron],
})
export class TurnosModule {}
