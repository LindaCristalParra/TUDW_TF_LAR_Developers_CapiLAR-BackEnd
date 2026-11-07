import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { esErrorPrisma } from '../common/errores-prisma';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SESION_VENCIDA = 'Tu sesión venció. Iniciá sesión de nuevo.';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
// Expo takes up to 100 messages per request.
const EXPO_MAX_POR_PEDIDO = 100;

/** What the phone shows, plus `data` for the app to open the right screen. */
export interface MensajePush {
  titulo: string;
  cuerpo: string;
  data: { tipo: TipoPush; turnoId: number };
}

export type TipoPush =
  | 'TURNO_NUEVO'
  | 'TURNO_CANCELADO'
  | 'TURNO_CONFIRMADO'
  | 'TURNO_RECHAZADO'
  | 'TURNO_REPROGRAMADO'
  | 'RECORDATORIO';

interface TicketExpo {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

// Push notifications through Expo (PWA-265). The token lives in the session (Sesion.pushToken):
// one per logged-in device, and a session that is closed stops getting them.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  // EXPO_PUSH_URL only changes it for the tests (a fake Expo, so no real pushes go out).
  private readonly expoUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.expoUrl = configService.get<string>('EXPO_PUSH_URL') || EXPO_URL;
  }

  /**
   * Saves the device's token in its session. The same phone may have been used with another
   * account (or an older session of this one): the token is taken off that session, so it only
   * reaches whoever is logged in now.
   */
  async registrarToken(
    usuarioId: number,
    sid: string,
    token: string,
  ): Promise<void> {
    // Clearing it elsewhere and setting it here go in one transaction, so an expired session (401)
    // leaves the others as they were. Two registrations of the same token at once (only seen in
    // tests: it's one phone) deadlock: both clears find no row and lock the gap of the unique index
    // where the token goes, then both inserts wait for the other. MySQL kills one at once (P2034);
    // it retries after the other committed, and then its clear (a locking read under REPEATABLE
    // READ) sees that session's token and takes it off. Last one wins. Tried and dropped (07/11):
    // READ COMMITTED skips a row another request changed but didn't commit, so the clear misses it
    // and the insert clashes (P2002); two separate statements without a transaction kept taking the
    // token from each other. A short random pause keeps the retries from clashing again.
    for (let intento = 1; ; intento++) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.sesion.updateMany({
              where: { pushToken: token, sid: { not: sid } },
              data: { pushToken: null },
            });
            const { count } = await tx.sesion.updateMany({
              where: {
                sid,
                usuarioId,
                revocadaEn: null,
                vence: { gt: new Date() },
              },
              data: { pushToken: token },
            });
            if (count === 0) {
              throw new UnauthorizedException(SESION_VENCIDA);
            }
          },
          { maxWait: 10_000, timeout: 10_000 },
        );
        return;
      } catch (error) {
        const reintentable =
          esErrorPrisma(error, 'P2034') || esErrorPrisma(error, 'P2002');
        if (!reintentable || intento === 8) {
          throw error;
        }
        this.logger.warn(
          `Retrying the push token of session ${sid} (${(error as Prisma.PrismaClientKnownRequestError).code})`,
        );
        await new Promise((listo) => setTimeout(listo, 10 + randomInt(40)));
      }
    }
  }

  /** Stops push notifications on this device (e.g. turned off in the app). Nothing to do is fine too. */
  async quitarToken(usuarioId: number, sid: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { sid, usuarioId },
      data: { pushToken: null },
    });
  }

  /**
   * Sends a push to every logged-in device of these users. Not awaited, like the emails: a slow or
   * failed push must not delay or break the request; a failure only leaves an error in the log
   * (decided 07/11: pushes are not saved in Notificacion).
   */
  avisar(usuarioIds: number[], mensaje: MensajePush): void {
    this.enviar(usuarioIds, mensaje).catch((error) => {
      this.logger.error(
        `Could not send the push "${mensaje.titulo}" to users ${usuarioIds.join(', ')}`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  /** Like avisar, but awaited (the reminders cron sends them one by one). Never throws. */
  async enviarYEsperar(
    usuarioIds: number[],
    mensaje: MensajePush,
  ): Promise<void> {
    try {
      await this.enviar(usuarioIds, mensaje);
    } catch (error) {
      this.logger.error(
        `Could not send the push "${mensaje.titulo}" to users ${usuarioIds.join(', ')}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async enviar(
    usuarioIds: number[],
    mensaje: MensajePush,
  ): Promise<void> {
    const sesiones = await this.prisma.sesion.findMany({
      where: {
        usuarioId: { in: usuarioIds },
        pushToken: { not: null },
        revocadaEn: null,
        vence: { gt: new Date() },
        usuario: { fechaBaja: null },
      },
      select: { pushToken: true },
    });
    const tokens = sesiones.map((s) => s.pushToken!);
    for (let i = 0; i < tokens.length; i += EXPO_MAX_POR_PEDIDO) {
      await this.enviarAExpo(tokens.slice(i, i + EXPO_MAX_POR_PEDIDO), mensaje);
    }
  }

  // One request to Expo's push API. Its answer has one ticket per message, in the same order.
  // A token Expo no longer knows (the app was uninstalled, or the token changed) comes back as
  // DeviceNotRegistered: it's taken off its session so it isn't tried again.
  // Not covered: the receipts Expo gives later (a second check, minutes after); a token that only
  // fails there is cleaned up the next time a push to it fails here.
  private async enviarAExpo(
    tokens: string[],
    mensaje: MensajePush,
  ): Promise<void> {
    const accessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN');
    const respuesta = await fetch(this.expoUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title: mensaje.titulo,
          body: mensaje.cuerpo,
          data: mensaje.data,
          sound: 'default',
        })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    const datos = (await respuesta.json().catch(() => ({}))) as {
      data?: TicketExpo[];
      errors?: { code?: string; message?: string }[];
    };
    if (!respuesta.ok || !Array.isArray(datos.data)) {
      const error = datos.errors?.[0];
      throw new Error(
        `Expo ${error?.code ?? respuesta.status}: ${error?.message ?? 'no tickets'}`,
      );
    }

    const noRegistrados: string[] = [];
    datos.data.forEach((ticket, i) => {
      if (ticket.status === 'ok') {
        return;
      }
      if (ticket.details?.error === 'DeviceNotRegistered') {
        noRegistrados.push(tokens[i]);
        return;
      }
      this.logger.error(
        `Expo rejected the push "${mensaje.titulo}": ${ticket.details?.error ?? ''} ${ticket.message ?? ''}`.trim(),
      );
    });
    if (noRegistrados.length) {
      await this.prisma.sesion.updateMany({
        where: { pushToken: { in: noRegistrados } },
        data: { pushToken: null },
      });
      this.logger.warn(
        `Removed ${noRegistrados.length} push token(s) Expo no longer knows`,
      );
    }
  }
}
