import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TurnosService } from './turnos.service';

// F06: every 15 minutes, reminders (email and WhatsApp) for the turnos of the next 24 h.
@Injectable()
export class RecordatoriosCron {
  private readonly logger = new Logger(RecordatoriosCron.name);

  constructor(private readonly turnosService: TurnosService) {}

  @Cron('*/15 * * * *', { name: 'recordatorios' })
  async enviar(): Promise<void> {
    try {
      const enviados = await this.turnosService.enviarRecordatorios();
      if (enviados > 0) {
        this.logger.log(`Sent ${enviados} reminder(s)`);
      }
    } catch (error) {
      this.logger.error(
        'Reminder job failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
