import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AlertasStockService } from './alertas-stock.service';

// F11 low-stock alerts: used wherever the stock or the minimum changes (movements, record
// consumption, item edits).
@Module({
  imports: [MailModule],
  providers: [AlertasStockService],
  exports: [AlertasStockService],
})
export class AlertasStockModule {}
