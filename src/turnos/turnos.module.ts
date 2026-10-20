import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AgendaDiariaCron } from './agenda-diaria.cron';
import { ClientesTurnosController } from './clientes-turnos.controller';
import { RecordatoriosCron } from './recordatorios.cron';
import { TurnosController } from './turnos.controller';
import { TurnosService } from './turnos.service';

@Module({
  imports: [MailModule, UsersModule],
  controllers: [TurnosController, ClientesTurnosController],
  providers: [TurnosService, RecordatoriosCron, AgendaDiariaCron],
})
export class TurnosModule {}
