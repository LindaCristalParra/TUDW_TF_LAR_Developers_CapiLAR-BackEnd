import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertasStockService,
  ArticuloEnMinimo,
  llegoAlMinimo,
} from '../alertas-stock/alertas-stock.service';
import { MAX_DECIMAL_10_3 } from '../articulos/dto/create-articulo.dto';
import { esFechaValida } from '../common/fecha-hora';
import { Pagina, paginar } from '../common/paginacion';
import { ArticuloSinStock } from '../fichas/consumo.service';
import { EstadoRemito, Prisma, TipoRemito } from '../generated/prisma/client';
import { marcaParaApi } from '../marcas/marca-api';
import { PrismaService } from '../prisma/prisma.service';
import { AnularCompraDto } from './dto/anular-compra.dto';
import { CreateCompraDto } from './dto/create-compra.dto';
import { ListComprasQueryDto } from './dto/list-compras-query.dto';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

const NO_ENCONTRADA = 'Compra no encontrada';
const TOPE_STOCK = 'El stock no puede superar los 9.999.999,999 envases';

const compraInclude = {
  proveedor: { select: { id: true, cuit: true, razonSocial: true } },
  usuario: { select: { id: true, nombre: true, apellido: true } },
  detalles: {
    orderBy: { id: 'asc' },
    include: {
      articulo: {
        select: {
          id: true,
          nombre: true,
          codigo: true,
          tipoPeso: true,
          pesoInicial: true,
          marca: true,
        },
      },
    },
  },
} satisfies Prisma.RemitoInclude;

type CompraConDetalles = Prisma.RemitoGetPayload<{
  include: typeof compraInclude;
}>;

type ArticuloBloqueado = ArticuloEnMinimo & { fechaBaja: Date | null };

// Decimals travel as text without trailing zeros, like the rest of the API (e.g. "6", "8400").
function compraParaApi(compra: CompraConDetalles) {
  const lineas = compra.detalles.map((detalle) => {
    // Always set in a COMPRA (required by the DTO).
    const costoUnitario = detalle.costoUnitario ?? new Decimal(0);
    return {
      id: detalle.id,
      articulo: {
        ...detalle.articulo,
        marca: marcaParaApi(detalle.articulo.marca),
      },
      cantidad: detalle.cantidad,
      costoUnitario,
      subtotal: costoUnitario
        .times(detalle.cantidad)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    };
  });
  return {
    id: compra.id,
    fecha: compra.fecha,
    estado: compra.estado,
    numComprobante: compra.numComprobante,
    // Only a cancelled one has it: why it was cancelled.
    motivo: compra.motivo,
    proveedor: compra.proveedor,
    usuario: compra.usuario,
    lineas,
    total: lineas.reduce((suma, l) => suma.plus(l.subtotal), new Decimal(0)),
  };
}

// "2026-11-07" → the instant that day starts in the salon (Argentina, UTC-3 with no daylight saving).
function inicioDelDiaEnSalon(fecha: string, diasDespues = 0): Date {
  const inicio = new Date(`${fecha}T00:00:00.000-03:00`);
  inicio.setUTCDate(inicio.getUTCDate() + diasDespues);
  return inicio;
}

// F13 purchases (PWA-178): a Remito COMPRA from a supplier, born APLICADO (decided 07/11: PENDIENTE
// isn't used). Loading it adds each line to the item's stock and its costoUnitario becomes the item's
// precioCosto. Cancelling it takes the stock back (precioCosto stays).
// Locks, always in this order so two transactions never wait for each other in a circle:
// supplier or purchase first, then the items in id order (like the movements and the records).
@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertasStock: AlertasStockService,
  ) {}

  async create(dto: CreateCompraDto, usuarioId: number) {
    const id = await this.prisma.$transaction(
      async (tx) => {
        await this.proveedorBloqueado(tx, dto.proveedorId);
        // With the supplier locked, two purchases of the same supplier can't both pass this check.
        const repetida = await tx.remito.findFirst({
          where: {
            tipo: TipoRemito.COMPRA,
            proveedorId: dto.proveedorId,
            numComprobante: dto.numComprobante,
            estado: { not: EstadoRemito.ANULADO },
          },
          select: { id: true },
        });
        if (repetida) {
          throw new ConflictException(
            `Ya hay una compra de este proveedor con el comprobante ${dto.numComprobante}`,
          );
        }
        const articulos = await this.articulosBloqueados(
          tx,
          dto.lineas.map((l) => l.articuloId),
        );
        const inactivos = dto.lineas.filter(
          (l) => articulos.get(l.articuloId)?.fechaBaja !== null,
        );
        if (inactivos.length) {
          throw new BadRequestException(
            `No existen o están dados de baja los artículos ${inactivos
              .map((l) => {
                const articulo = articulos.get(l.articuloId);
                return articulo
                  ? `${l.articuloId} (${articulo.nombre})`
                  : l.articuloId;
              })
              .join(', ')}`,
          );
        }
        const lineas = dto.lineas.map((l) => ({
          articuloId: l.articuloId,
          cantidad: new Decimal(l.cantidad),
          costoUnitario: new Decimal(l.costoUnitario),
        }));
        const stocks = lineas.map((l) =>
          articulos.get(l.articuloId)!.stock.plus(l.cantidad),
        );
        if (stocks.some((stock) => stock.abs().gt(MAX_DECIMAL_10_3))) {
          throw new BadRequestException(TOPE_STOCK);
        }
        const compra = await tx.remito.create({
          data: {
            tipo: TipoRemito.COMPRA,
            estado: EstadoRemito.APLICADO,
            numComprobante: dto.numComprobante,
            proveedor: { connect: { id: dto.proveedorId } },
            usuario: { connect: { id: usuarioId } },
            detalles: { create: lineas },
          },
          select: { id: true },
        });
        // In id order, the same as the locks. A purchase only adds stock, so it never reaches a
        // minimum (no alert).
        for (const [i, linea] of [...lineas.entries()].sort(
          ([, a], [, b]) => a.articuloId - b.articuloId,
        )) {
          await tx.articulo.update({
            where: { id: linea.articuloId },
            data: { stock: stocks[i], precioCosto: linea.costoUnitario },
          });
        }
        return compra.id;
      },
      // Purchases with the same items wait for each other (like the movements).
      { maxWait: 10_000, timeout: 10_000 },
    );
    return this.findOne(id);
  }

  async findAll(
    query: ListComprasQueryDto,
  ): Promise<Pagina<ReturnType<typeof compraParaApi>>> {
    for (const fecha of [query.desde, query.hasta]) {
      if (fecha && !esFechaValida(fecha)) {
        throw new BadRequestException(`La fecha ${fecha} no existe`);
      }
    }
    if (query.desde && query.hasta && query.desde > query.hasta) {
      throw new BadRequestException('desde no puede ser posterior a hasta');
    }
    const { pagina, porPagina, skip, take } = paginar(query);
    const where: Prisma.RemitoWhereInput = {
      tipo: TipoRemito.COMPRA,
      proveedorId: query.proveedorId,
      estado: query.estado,
      numComprobante: query.numComprobante
        ? { contains: query.numComprobante }
        : undefined,
      fecha:
        query.desde || query.hasta
          ? {
              gte: query.desde ? inicioDelDiaEnSalon(query.desde) : undefined,
              // hasta is included: up to the start of the next day.
              lt: query.hasta ? inicioDelDiaEnSalon(query.hasta, 1) : undefined,
            }
          : undefined,
    };
    // Both reads in one transaction, so the total matches the page.
    const [compras, total] = await this.prisma.$transaction([
      this.prisma.remito.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        include: compraInclude,
        skip,
        take,
      }),
      this.prisma.remito.count({ where }),
    ]);
    return { items: compras.map(compraParaApi), total, pagina, porPagina };
  }

  // Also a cancelled one. 404 if it doesn't exist or isn't a purchase (a manual movement or a record's
  // consumption is not shown here).
  async findOne(id: number) {
    const compra = await this.prisma.remito.findFirst({
      where: { id, tipo: TipoRemito.COMPRA },
      include: compraInclude,
    });
    if (!compra) {
      throw new NotFoundException(NO_ENCONTRADA);
    }
    return compraParaApi(compra);
  }

  // ANULADO + takes back what it added (decided 07/11). The stock may go below 0 (it was already used):
  // it goes through and sinStock tells which ones; the ones that reach their minimum send the alert.
  // precioCosto doesn't go back. Also for items deactivated after the purchase.
  async anular(id: number, dto: AnularCompraDto) {
    const { sinStock, enMinimo } = await this.prisma.$transaction(
      async (tx) => {
        // The condition in the UPDATE itself (which also locks the row): two cancellations at the same
        // time can't both take the stock back.
        const { count } = await tx.remito.updateMany({
          where: { id, tipo: TipoRemito.COMPRA, estado: EstadoRemito.APLICADO },
          data: { estado: EstadoRemito.ANULADO, motivo: dto.motivo },
        });
        if (count === 0) {
          const compra = await tx.remito.findFirst({
            where: { id, tipo: TipoRemito.COMPRA },
            select: { id: true },
          });
          throw compra
            ? new BadRequestException('La compra ya está anulada')
            : new NotFoundException(NO_ENCONTRADA);
        }
        const detalles = await tx.remitoDetalle.findMany({
          where: { remitoId: id },
          orderBy: { articuloId: 'asc' },
          select: { articuloId: true, cantidad: true },
        });
        const articulos = await this.articulosBloqueados(
          tx,
          detalles.map((d) => d.articuloId),
        );
        const resultado: {
          sinStock: ArticuloSinStock[];
          enMinimo: ArticuloEnMinimo[];
        } = { sinStock: [], enMinimo: [] };
        for (const { articuloId, cantidad } of detalles) {
          const antes = articulos.get(articuloId)!;
          const stock = antes.stock.minus(cantidad);
          if (stock.abs().gt(MAX_DECIMAL_10_3)) {
            throw new BadRequestException(TOPE_STOCK);
          }
          await tx.articulo.update({
            where: { id: articuloId },
            data: { stock },
          });
          const despues = { ...antes, stock };
          if (stock.isNegative()) {
            resultado.sinStock.push({
              id: articuloId,
              nombre: antes.nombre,
              stock: stock.toString(),
            });
          }
          if (llegoAlMinimo(antes, despues, antes.fechaBaja)) {
            resultado.enMinimo.push(despues);
          }
        }
        return resultado;
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
    this.alertasStock.avisar(enMinimo);
    return { compra: await this.findOne(id), sinStock };
  }

  // --- helpers ---

  // Locks the supplier's row until the transaction ends: purchases of the same supplier wait for each
  // other (the repeated numComprobante check), and a deactivation waits for the purchase or the other
  // way round. 400 if it doesn't exist or is inactive (it comes in the body, like a record's items).
  private async proveedorBloqueado(
    tx: Prisma.TransactionClient,
    proveedorId: number,
  ): Promise<void> {
    const filas = await tx.$queryRaw<{ fechaBaja: Date | null }[]>`
      SELECT fechaBaja FROM Proveedor WHERE id = ${proveedorId} FOR UPDATE`;
    if (!filas.length) {
      throw new BadRequestException('El proveedor no existe');
    }
    if (filas[0].fechaBaja !== null) {
      throw new BadRequestException(
        'El proveedor está dado de baja: no se le pueden cargar compras',
      );
    }
  }

  // Locks the items' rows in id order (also inactive ones: the caller decides).
  private async articulosBloqueados(
    tx: Prisma.TransactionClient,
    ids: number[],
  ): Promise<Map<number, ArticuloBloqueado>> {
    const filas = await tx.$queryRaw<
      {
        id: number;
        nombre: string;
        stock: string;
        stockMinAlert: string;
        fechaBaja: Date | null;
      }[]
    >`
      SELECT id, nombre, CAST(stock AS CHAR) AS stock, CAST(stockMinAlert AS CHAR) AS stockMinAlert,
        fechaBaja
      FROM Articulo WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    return new Map(
      filas.map((f) => [
        Number(f.id),
        {
          id: Number(f.id),
          nombre: f.nombre,
          stock: new Decimal(f.stock),
          stockMinAlert: new Decimal(f.stockMinAlert),
          fechaBaja: f.fechaBaja,
        },
      ]),
    );
  }
}
