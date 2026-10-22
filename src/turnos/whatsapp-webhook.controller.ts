import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { WhatsAppService, aNumeroWhatsApp } from '../whatsapp/whatsapp.service';
import { TurnosService } from './turnos.service';

// What we read from Meta's webhook (statuses and other fields are ignored).
interface WebhookWhatsApp {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          from: string;
          type: string;
          button?: { payload: string; text: string };
        }[];
      };
    }[];
  }[];
}

// Only Meta calls it: no login (no guards), the signature proves the request is theirs.
@ApiExcludeController()
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly turnosService: TurnosService,
  ) {}

  // Meta checks the URL once, when the webhook is set up: we answer with the challenge.
  @Get()
  verificar(
    @Query('hub.mode') modo?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    if (!this.whatsAppService.suscripcionValida(modo, token)) {
      throw new ForbiddenException();
    }
    return challenge ?? '';
  }

  // Taps on the reminder's buttons. Always 200 once the signature is valid: an error would
  // make Meta resend the same message.
  @Post()
  @HttpCode(HttpStatus.OK)
  async recibir(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') firma: string | undefined,
    @Body() cuerpo: WebhookWhatsApp,
  ): Promise<void> {
    if (!this.whatsAppService.firmaValida(req.rawBody, firma)) {
      throw new ForbiddenException();
    }

    const mensajes = (cuerpo.entry ?? []).flatMap((entry) =>
      (entry.changes ?? []).flatMap((change) => change.value?.messages ?? []),
    );
    for (const mensaje of mensajes) {
      if (mensaje.type !== 'button' || !mensaje.button) continue;
      try {
        const respuesta = await this.turnosService.responderRecordatorio(
          mensaje.button.payload,
        );
        if (respuesta) {
          // Meta sends "549..."; we answer in the same format as the reminder (without the 9).
          await this.whatsAppService.enviarTexto(
            aNumeroWhatsApp(mensaje.from) ?? mensaje.from,
            respuesta,
          );
        }
      } catch (error) {
        this.logger.error(
          `Could not handle WhatsApp button from ${mensaje.from}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
