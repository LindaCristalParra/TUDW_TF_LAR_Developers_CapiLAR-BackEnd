import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { TurnosController } from './turnos.controller';
import { TurnosService } from './turnos.service';

@Module({
  imports: [MailModule],
  controllers: [TurnosController],
  providers: [TurnosService],
})
export class TurnosModule {}
