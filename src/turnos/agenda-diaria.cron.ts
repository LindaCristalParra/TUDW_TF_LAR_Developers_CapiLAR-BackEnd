import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SALON_TIME_ZONE } from '../common/fecha-hora';
import { TurnosService } from './turnos.service';

// F07: every day at 21:00 (salon time), each professional gets tomorrow's agenda by email.
@Injectable()
export class AgendaDiariaCron {
  private readonly logger = new Logger(AgendaDiariaCron.name);

  constructor(private readonly turnosService: TurnosService) {}

  @Cron('0 21 * * *', { name: 'agenda-diaria', timeZone: SALON_TIME_ZONE })
  async enviar(): Promise<void> {
    try {
      const enviados = await this.turnosService.enviarAgendasDiarias();
      this.logger.log(`Sent ${enviados} daily agenda(s)`);
    } catch (error) {
      this.logger.error(
        'Daily agenda job failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
