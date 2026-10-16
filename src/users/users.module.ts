import { Module } from '@nestjs/common';
import { FotosModule } from '../fotos/fotos.module';
import { MailModule } from '../mail/mail.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { VerificacionEmailService } from './verificacion-email.service';

@Module({
  imports: [FotosModule, MailModule],
  controllers: [UsersController],
  providers: [UsersService, VerificacionEmailService],
  exports: [UsersService, VerificacionEmailService],
})
export class UsersModule {}
