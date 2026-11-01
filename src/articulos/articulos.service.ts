import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { esErrorPrisma } from '../common/errores-prisma';
import { dateAFecha, esFechaValida, fechaADate } from '../common/fecha-hora';
import { Prisma, UsoArticulo } from '../generated/prisma/client';
import { MarcasService } from '../marcas/marcas.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { ListArticulosQueryDto } from './dto/list-articulos-query.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';

const articuloInclude = {
  marca: true,
} satisfies Prisma.ArticuloInclude;

type ArticuloConMarca = Prisma.ArticuloGetPayload<{
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

  async create(dto: CreateArticuloDto) {
    await this.marcasService.findOrFail(dto.marcaId).catch(() => {
      throw new BadRequestException('La marca no existe');
    });
    const data = {
      ...dto,
      ...this.opcionales(dto),
      fechaVencimiento: this.fechaVencimiento(dto.fechaVencimiento) ?? null,
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
    await this.findActivo(id);
    if (dto.marcaId !== undefined) {
      await this.marcasService.findOrFail(dto.marcaId).catch(() => {
        throw new BadRequestException('La marca no existe');
      });
    }
    const data = {
      ...dto,
      ...this.opcionales(dto),
      fechaVencimiento: this.fechaVencimiento(dto.fechaVencimiento),
    };
    try {
      const articulo = await this.prisma.articulo.update({
        where: { id },
        data,
        include: articuloInclude,
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

  // Decimals travel as text, like the other prices of the API (e.g. stock "3.500").
  private formatear(articulo: ArticuloConMarca) {
    const { fechaVencimiento } = articulo;
    return {
      ...articulo,
      fechaVencimiento: fechaVencimiento ? dateAFecha(fechaVencimiento) : null,
      // At the minimum or below (with minimum 0, an item with no stock left).
      bajoStock: articulo.stock.lte(articulo.stockMinAlert),
    };
  }
}
