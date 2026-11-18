import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Health check: the app is up and connected to the database. Without request limits, for
   * Docker's healthcheck; in production Caddy doesn't expose it (it queries the database).
   */
  @Get('health')
  @Public()
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  @ApiServiceUnavailableResponse({ description: 'No database connection' })
  health(): Promise<{ status: 'ok' }> {
    return this.appService.health();
  }
}
