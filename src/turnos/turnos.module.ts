import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { TurnosController } from './turnos.controller';
import { TurnosService } from './turnos.service';

@Module({
  imports: [MailModule, UsersModule],
  controllers: [TurnosController],
  providers: [TurnosService],
})
export class TurnosModule {}
