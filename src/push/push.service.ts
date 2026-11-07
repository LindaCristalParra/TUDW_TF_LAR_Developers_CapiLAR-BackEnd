import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { esErrorPrisma } from '../common/errores-prisma';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SESION_VENCIDA = 'Tu sesión venció. Iniciá sesión de nuevo.';

// Push notifications through Expo (PWA-265). The token lives in the session (Sesion.pushToken):
// one per logged-in device, and a session that is closed stops getting them.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}
