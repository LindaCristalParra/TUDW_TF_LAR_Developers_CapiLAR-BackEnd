import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AgendaDiariaCron } from './agenda-diaria.cron';
import { RecordatoriosCron } from './recordatorios.cron';
import { TurnosController } from './turnos.controller';
import { TurnosService } from './turnos.service';

@Module({
  imports: [MailModule, UsersModule],
  controllers: [TurnosController],
  providers: [TurnosService, RecordatoriosCron, AgendaDiariaCron],
})
export class TurnosModule {}
