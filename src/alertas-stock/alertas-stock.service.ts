import { Injectable, Logger } from '@nestjs/common';
import {
  EstadoEnvio,
  MedioNotificacion,
  Prisma,
  Rol,
  TipoNotificacion,
} from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

type Decimal = Prisma.Decimal;

export type EstadoStock = { stock: Decimal; stockMinAlert: Decimal };

export type ArticuloEnMinimo = EstadoStock & { id: number; nombre: string };

// F11 (PWA-179): an item reaches its minimum when it was above it and a change (a movement, a record's
// consumption or a new minimum) leaves it at the minimum or below. Once per crossing: while it stays
// there nothing else is sent, until it goes above again. With minimum 0, when it runs out. Only active
// items. Both states are read inside the change's row lock, so two changes can't report the same one.
export function llegoAlMinimo(
  antes: EstadoStock,
  despues: EstadoStock,
  fechaBaja: Date | null,
): boolean {
  return (
    fechaBaja === null &&
    antes.stock.gt(antes.stockMinAlert) &&
    despues.stock.lte(despues.stockMinAlert)
  );
}

// "3.5" → "3,5", as the salon reads it.
function enEnvases(valor: Decimal): string {
  return valor.toString().replace('.', ',');
}

@Injectable()
export class AlertasStockService {
  private readonly logger = new Logger(AlertasStockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // After the change's commit, without waiting (like the turno emails): the answer doesn't wait for
  // the mail server, and a failure is only logged. One email per ADMIN listing every item of the change;
  // one Notificacion row per ADMIN and item. The panel is GET /articulos?bajoStock=true (decided 04/11).
  avisar(articulos: ArticuloEnMinimo[]): void {
    if (!articulos.length) {
      return;
    }
    this.enviar(articulos).catch((error) => {
      this.logger.error(
        'Could not send the low-stock alert',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  private async enviar(articulos: ArticuloEnMinimo[]): Promise<void> {
    const admins = await this.prisma.usuario.findMany({
      where: { rol: Rol.ADMIN, fechaBaja: null },
      select: { id: true, nombre: true, email: true },
    });
    const lista = [...articulos]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((a) => ({
        nombre: a.nombre,
        stock: enEnvases(a.stock),
        minimo: enEnvases(a.stockMinAlert),
      }));
    for (const admin of admins) {
      let estadoEnvio: EstadoEnvio = EstadoEnvio.ENVIADO;
      try {
        await this.mailService.sendStockMinimo(admin.email, {
          nombre: admin.nombre,
          articulos: lista,
        });
      } catch (error) {
        estadoEnvio = EstadoEnvio.ERROR;
        this.logger.error(
          `Could not send the low-stock alert to ${admin.email}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      await this.prisma.notificacion.createMany({
        data: articulos.map((a) => ({
          usuarioId: admin.id,
          articuloId: a.id,
          medio: MedioNotificacion.EMAIL,
          tipo: TipoNotificacion.STOCK_MINIMO,
          estadoEnvio,
        })),
      });
    }
  }
}
