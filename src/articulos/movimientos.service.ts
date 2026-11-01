import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoRemito, Prisma, TipoRemito } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { articuloInclude, ArticulosService } from './articulos.service';
import { MAX_DECIMAL_10_3 } from './dto/create-articulo.dto';
import { CreateMovimientoDto } from './dto/create-movimiento.dto';

// One movement of an item = one RemitoDetalle row, with its Remito (type, reason, who).
const movimientoInclude = {
  remito: {
    include: {
      usuario: { select: { id: true, nombre: true, apellido: true } },
    },
  },
} satisfies Prisma.RemitoDetalleInclude;

type MovimientoConRemito = Prisma.RemitoDetalleGetPayload<{
  include: typeof movimientoInclude;
}>;

@Injectable()
export class MovimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articulosService: ArticulosService,
  ) {}

  // Manual movements (INGRESO, EGRESO, AJUSTE): a Remito without supplier, born APLICADO.
  // An EGRESO may leave the stock below 0 (decided 31/10): it goes through and stockNegativo tells it.
  async create(
    articuloId: number,
    dto: CreateMovimientoDto,
    usuarioId: number,
  ) {
    if (dto.tipo !== TipoRemito.AJUSTE && dto.cantidad === 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }
    const { detalleId, articulo, stock } = await this.prisma.$transaction(
      (tx) => this.aplicar(tx, articuloId, dto, usuarioId),
      // Movements of the same item wait for each other (the row lock), and each one holds a
      // pooled connection while it waits: Prisma's defaults (2 s / 5 s) are too short for a burst.
      { maxWait: 10_000, timeout: 10_000 },
    );
    // Read after the commit, so the lock is held as short as possible: the row doesn't change.
    const movimiento = await this.prisma.remitoDetalle.findUniqueOrThrow({
      where: { id: detalleId },
      include: movimientoInclude,
    });
    return {
      movimiento: this.formatear(movimiento),
      articulo: this.articulosService.formatear(articulo),
      stockNegativo: stock.isNegative(),
    };
  }

  // The item's history, newest first. Also for an inactive item (404 only if it doesn't exist).
  async findDeArticulo(articuloId: number) {
    await this.articulosService.findOne(articuloId);
    const movimientos = await this.prisma.remitoDetalle.findMany({
      where: { articuloId },
      orderBy: [{ remito: { fecha: 'desc' } }, { id: 'desc' }],
      include: movimientoInclude,
    });
    return movimientos.map((m) => this.formatear(m));
  }

  // --- helpers ---

  private async aplicar(
    tx: Prisma.TransactionClient,
    articuloId: number,
    dto: CreateMovimientoDto,
    usuarioId: number,
  ) {
    const actual = await this.stockBloqueado(tx, articuloId);
    const informada = new Prisma.Decimal(dto.cantidad);
    // Signed, as it is stored: what the stock changes by.
    const cantidad =
      dto.tipo === TipoRemito.INGRESO
        ? informada
        : dto.tipo === TipoRemito.EGRESO
          ? informada.negated()
          : informada.minus(actual); // AJUSTE: the counted stock minus the current one (may be 0).
    const stock = actual.plus(cantidad);
    // A valid amount can still push the stock (or an AJUSTE's difference) past the column.
    if (
      stock.abs().gt(MAX_DECIMAL_10_3) ||
      cantidad.abs().gt(MAX_DECIMAL_10_3)
    ) {
      throw new BadRequestException(
        'El stock no puede superar los 9.999.999,999 envases',
      );
    }
    const { id } = await tx.remitoDetalle.create({
      data: {
        cantidad,
        articulo: { connect: { id: articuloId } },
        remito: {
          create: {
            tipo: dto.tipo,
            estado: EstadoRemito.APLICADO,
            motivo: dto.motivo || null,
            numComprobante: dto.numComprobante || null,
            usuario: { connect: { id: usuarioId } },
          },
        },
      },
      select: { id: true },
    });
    // The item as this movement left it (read inside the lock, so another one can't sneak in).
    const articulo = await tx.articulo.update({
      where: { id: articuloId },
      data: { stock },
      include: articuloInclude,
    });
    return { detalleId: id, articulo, stock };
  }

  // Locks the item's row until the transaction ends: another movement of the same item waits, so
  // the stock read here (an AJUSTE's base) can't change before it is written. 404 if it doesn't
  // exist or is inactive (it has to be reactivated first).
  private async stockBloqueado(
    tx: Prisma.TransactionClient,
    articuloId: number,
  ): Promise<Prisma.Decimal> {
    const filas = await tx.$queryRaw<
      { stock: string; fechaBaja: Date | null }[]
    >`
      SELECT CAST(stock AS CHAR) AS stock, fechaBaja
      FROM Articulo WHERE id = ${articuloId} FOR UPDATE`;
    const fila = filas[0];
    if (!fila || fila.fechaBaja !== null) {
      throw new NotFoundException('Artículo no encontrado');
    }
    return new Prisma.Decimal(fila.stock);
  }

  // cantidad is signed and travels as text, like the stock (e.g. "-1.500").
  private formatear(movimiento: MovimientoConRemito) {
    const { remito } = movimiento;
    return {
      id: movimiento.id,
      remitoId: remito.id,
      fecha: remito.fecha,
      tipo: remito.tipo,
      estado: remito.estado,
      cantidad: movimiento.cantidad,
      motivo: remito.motivo,
      numComprobante: remito.numComprobante,
      usuario: remito.usuario,
    };
  }
}
