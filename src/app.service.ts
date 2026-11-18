import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  // The app is up and reaches the database (PWA-190). Docker checks it every few seconds.
  // The route is public, so the 503 doesn't say why: the database error only goes to the log.
  async health(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(
        `Health check: no database connection (${error instanceof Error ? error.message : String(error)})`,
      );
      throw new ServiceUnavailableException('Servicio no disponible');
    }
    return { status: 'ok' };
  }
}
