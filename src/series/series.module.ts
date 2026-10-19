import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SeriesController } from './series.controller';
import { SeriesService } from './series.service';

@Module({
  imports: [MailModule],
  controllers: [SeriesController],
  providers: [SeriesService],
})
export class SeriesModule {}
