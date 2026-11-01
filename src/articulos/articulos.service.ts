import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { esErrorPrisma } from '../common/errores-prisma';
import { dateAFecha, esFechaValida, fechaADate } from '../common/fecha-hora';
import {
  EstadoRemito,
  Prisma,
  TipoRemito,
  UsoArticulo,
} from '../generated/prisma/client';
import { marcaParaApi } from '../marcas/marca-api';
import { MarcasService } from '../marcas/marcas.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { ListArticulosQueryDto } from './dto/list-articulos-query.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';

// envaseEnUso is null when no container is open.
export const articuloInclude = {
  marca: true,
  envaseEnUso: { select: { pesoActual: true, tipoPeso: true } },
} satisfies Prisma.ArticuloInclude;

export type ArticuloConMarca = Prisma.ArticuloGetPayload<{
  include: typeof articuloInclude;
}>;

// No 0/O or 1/I/L, so a code read off a label can't be mistyped.
const QR_LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const QR_LARGO = 8;

/** e.g. "ART-7K2M9QXP": the text of the item's QR. */
function nuevoQr(): string {
  let codigo = '';
  for (let i = 0; i < QR_LARGO; i++) {
    codigo += QR_LETRAS[randomInt(QR_LETRAS.length)];
  }
  return `ART-${codigo}`;
}

/** The INGRESO an item's initial stock enters with (nested in the item's create). */
export function movimientoStockInicial(
  stock: number,
  usuarioId: number,
): Prisma.RemitoDetalleCreateWithoutArticuloInput {
  return {
    cantidad: stock,
    remito: {
      create: {
        tipo: TipoRemito.INGRESO,
        estado: EstadoRemito.APLICADO,
        motivo: 'Stock inicial',
        usuario: { connect: { id: usuarioId } },
      },
    },
  };
}

@Injectable()
export class ArticulosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marcasService: MarcasService,
  ) {}

  async findAll(query: ListArticulosQueryDto) {
    const stockMin = this.prisma.articulo.fields.stockMinAlert;
    const articulos = await this.prisma.articulo.findMany({
      where: {
        fechaBaja: query.incluirBajas ? undefined : null,
        marcaId: query.marcaId,
        tipoProducto: query.tipoProducto,
        uso: this.filtroUso(query.uso),
        stock:
          query.bajoStock === undefined
            ? undefined
            : query.bajoStock
              ? { lte: stockMin }
              : { gt: stockMin },
        OR: query.search
          ? [
              { nombre: { contains: query.search } },
              { codigo: { contains: query.search } },
            ]
          : undefined,
      },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      include: articuloInclude,
    });
    return articulos.map((a) => this.formatear(a));
  }

  // Also inactive ones (fechaBaja tells it), so past records and movements can show them.
  async findOne(id: number) {
    return this.formatear(await this.findOrFail(id));
  }

  // What mobile and the front scan. Also inactive ones (fechaBaja tells it): the app decides what to
  // show, and a missing code is a 404. The column's collation already ignores case.
  async findByQr(codigo: string) {
    const articulo = await this.prisma.articulo.findUnique({
      where: { qr: codigo },
      include: articuloInclude,
    });
    if (!articulo) {
      throw new NotFoundException('Artículo no encontrado');
    }
    return this.formatear(articulo);
  }

  // The initial stock is the item's first movement (an INGRESO by whoever creates it), written in
  // the same nested create, so the history always adds up to the stock.
  async create(dto: CreateArticuloDto, usuarioId: number) {
    this.assertPrecioVenta(dto.uso, dto.precioVenta);
    await this.assertMarcaExiste(dto.marcaId);
    const data = {
      ...dto,
      ...this.opcionales(dto),
      fechaVencimiento: this.fechaVencimiento(dto.fechaVencimiento) ?? null,
      remitoDetalles: dto.stock
        ? { create: movimientoStockInicial(dto.stock, usuarioId) }
        : undefined,
    };
    // The QR is random: on the (very unlikely) clash with another item, try a new one.
    for (let intento = 1; ; intento++) {
      try {
        const articulo = await this.prisma.articulo.create({
          data: { ...data, qr: nuevoQr() },
          include: articuloInclude,
        });
        return this.formatear(articulo);
      } catch (error) {
        // The brand was deleted between the check and the insert.
        if (esErrorPrisma(error, 'P2003')) {
          throw new BadRequestException('La marca no existe');
        }
        if (!esErrorPrisma(error, 'P2002') || intento === 3) {
          throw error;
        }
      }
    }
  }

  async update(id: number, dto: UpdateArticuloDto) {
    const actual = await this.findActivo(id);
    // The rule applies to how the item ends up: a new use with the old price, or the other way round.
    const uso = dto.uso ?? actual.uso;
    const pasaASalon = uso === UsoArticulo.SALON && actual.uso !== uso;
    const precioVenta =
      dto.precioVenta !== undefined
        ? dto.precioVenta
        : pasaASalon
          ? null // Becoming a salon-only item drops the sale price it had.
          : actual.precioVenta;
    this.assertPrecioVenta(uso, precioVenta);
    if (dto.marcaId !== undefined) {
      await this.assertMarcaExiste(dto.marcaId);
    }
    const data = {
      ...dto,
      ...this.opcionales(dto),
      precioVenta,
      fechaVencimiento: this.fechaVencimiento(dto.fechaVencimiento),
    };
    try {
      if (dto.tipoPeso === undefined && dto.pesoInicial === undefined) {
        const articulo = await this.prisma.articulo.update({
          where: { id },
          data,
          include: articuloInclude,
        });
        return this.formatear(articulo);
      }
      const articulo = await this.prisma.$transaction(async (tx) => {
        // The update locks the item's row first, so opening or updating the container (which lock
        // it too) can't slip in between with the old unit or content.
        await tx.articulo.update({ where: { id }, data });
        // In another unit pesoActual means nothing: the open container is finished (decided 01/11).
        if (dto.tipoPeso !== undefined) {
          await tx.articuloUso.deleteMany({
            where: { articuloId: id, tipoPeso: { not: dto.tipoPeso } },
          });
        }
        // A smaller container can't hold more than it did: what's left is cut down to the new
        // content (decided 01/11; most likely a typo fixed while the container stays in use).
        if (dto.pesoInicial !== undefined) {
          await tx.articuloUso.updateMany({
            where: { articuloId: id, pesoActual: { gt: dto.pesoInicial } },
            data: { pesoActual: dto.pesoInicial },
          });
        }
        return tx.articulo.findUniqueOrThrow({
          where: { id },
          include: articuloInclude,
        });
      });
      return this.formatear(articulo);
    } catch (error) {
      // The new brand was deleted between the check and the update.
      if (esErrorPrisma(error, 'P2003')) {
        throw new BadRequestException('La marca no existe');
      }
      throw error;
    }
  }

  // Logical delete: it stops being offered, but records and movements keep pointing to it.
  async deactivate(id: number): Promise<void> {
    await this.findActivo(id);
    await this.prisma.articulo.update({
      where: { id },
      data: { fechaBaja: new Date() },
    });
  }

  async reactivate(id: number) {
    const articulo = await this.findOrFail(id);
    if (articulo.fechaBaja === null) {
      throw new BadRequestException('El artículo ya está activo');
    }
    const actualizado = await this.prisma.articulo.update({
      where: { id },
      data: { fechaBaja: null },
      include: articuloInclude,
    });
    return this.formatear(actualizado);
  }

  // --- helpers ---

  // Items that are sold (VENTA, AMBOS) need a sale price; salon-only ones (SALON) can't have one.
  private assertPrecioVenta(
    uso: UsoArticulo,
    precioVenta: Prisma.Decimal | number | null | undefined,
  ): void {
    const tienePrecio = precioVenta !== null && precioVenta !== undefined;
    if (uso === UsoArticulo.SALON && tienePrecio) {
      throw new BadRequestException(
        'Un artículo de uso SALON no lleva precio de venta',
      );
    }
    if (uso !== UsoArticulo.SALON && !tienePrecio) {
      throw new BadRequestException(
        'El precio de venta es obligatorio para los artículos de uso VENTA o AMBOS',
      );
    }
  }

  // A missing brand is the client's mistake (400); any other error (e.g. the database is down)
  // goes on as it is, so it still ends in a 500.
  private async assertMarcaExiste(marcaId: number): Promise<void> {
    try {
      await this.marcasService.findOrFail(marcaId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException('La marca no existe');
      }
      throw error;
    }
  }

  private async findOrFail(id: number): Promise<ArticuloConMarca> {
    const articulo = await this.prisma.articulo.findUnique({
      where: { id },
      include: articuloInclude,
    });
    if (!articulo) {
      throw new NotFoundException('Artículo no encontrado');
    }
    return articulo;
  }

  private async findActivo(id: number): Promise<ArticuloConMarca> {
    const articulo = await this.findOrFail(id);
    if (articulo.fechaBaja !== null) {
      throw new NotFoundException('Artículo no encontrado');
    }
    return articulo;
  }

  // SALON and VENTA also bring the AMBOS ones.
  private filtroUso(
    uso?: UsoArticulo,
  ): Prisma.EnumUsoArticuloFilter | undefined {
    if (!uso) {
      return undefined;
    }
    return uso === UsoArticulo.AMBOS
      ? { equals: uso }
      : { in: [uso, UsoArticulo.AMBOS] };
  }

  // Optional texts: "" or null clears them; undefined leaves them as they are.
  private opcionales(dto: UpdateArticuloDto) {
    const limpiar = (valor?: string | null) =>
      valor === undefined ? undefined : valor || null;
    return {
      codigo: limpiar(dto.codigo),
      tonalidad: limpiar(dto.tonalidad),
    };
  }

  /** "YYYY-MM-DD" -> Date for the DATE column; null clears it. 400 if it isn't a real date. */
  private fechaVencimiento(fecha?: string | null): Date | null | undefined {
    if (fecha === undefined || fecha === null) {
      return fecha;
    }
    if (!esFechaValida(fecha)) {
      throw new BadRequestException('La fecha de vencimiento no es válida');
    }
    return fechaADate(fecha);
  }

  // Decimals travel as text without trailing zeros, like the other prices of the API (e.g. stock
  // "3.5", precioCosto "8400").
  // The same shape for every role, precioCosto included: professionals may see cost prices
  // (salon decision, 31/10), so it is not filtered by role on purpose. Movements answer with it too.
  formatear(articulo: ArticuloConMarca) {
    const { fechaVencimiento } = articulo;
    return {
      ...articulo,
      marca: marcaParaApi(articulo.marca),
      fechaVencimiento: fechaVencimiento ? dateAFecha(fechaVencimiento) : null,
      // At the minimum or below (with minimum 0, an item with no stock left).
      bajoStock: articulo.stock.lte(articulo.stockMinAlert),
    };
  }
}
