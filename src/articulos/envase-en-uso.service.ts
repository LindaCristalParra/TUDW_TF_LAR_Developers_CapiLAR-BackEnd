import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UnidadInsumo } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { articuloInclude, ArticulosService } from './articulos.service';
import { UpdateEnvaseEnUsoDto } from './dto/update-envase-en-uso.dto';

// The open container of an item (ArticuloUso), one at most. Informative: none of this moves the
// stock (decided 01/11); a record's consumption will lower both (F11, step 5).
@Injectable()
export class EnvaseEnUsoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articulosService: ArticulosService,
  ) {}

  // A full container, in the item's unit. One already open is replaced (it counts as finished).
  async abrir(articuloId: number) {
    const articulo = await this.prisma.$transaction(async (tx) => {
      const { pesoInicial, tipoPeso } = await this.articuloBloqueado(
        tx,
        articuloId,
      );
      await tx.articuloUso.upsert({
        where: { articuloId },
        create: { articuloId, pesoActual: pesoInicial, tipoPeso },
        update: { pesoActual: pesoInicial, tipoPeso },
      });
      return tx.articulo.findUniqueOrThrow({
        where: { id: articuloId },
        include: articuloInclude,
      });
    });
    return this.articulosService.formatear(articulo);
  }

  // What's left, e.g. after weighing it. Up to the container's content.
  async actualizar(articuloId: number, dto: UpdateEnvaseEnUsoDto) {
    const articulo = await this.prisma.$transaction(async (tx) => {
      const { pesoInicial } = await this.articuloBloqueado(tx, articuloId);
      if (pesoInicial.lt(dto.pesoActual)) {
        throw new BadRequestException(
          `Lo que queda no puede superar el contenido del envase (${pesoInicial.toString()})`,
        );
      }
      const { count } = await tx.articuloUso.updateMany({
        where: { articuloId },
        data: { pesoActual: dto.pesoActual },
      });
      if (count === 0) {
        throw new NotFoundException('El artículo no tiene un envase abierto');
      }
      return tx.articulo.findUniqueOrThrow({
        where: { id: articuloId },
        include: articuloInclude,
      });
    });
    return this.articulosService.formatear(articulo);
  }

  // Finishing it deletes the row. Also for an inactive item, so a container left open can be closed.
  async terminar(articuloId: number): Promise<void> {
    const { count } = await this.prisma.articuloUso.deleteMany({
      where: { articuloId },
    });
    if (count === 0) {
      await this.articulosService.findOne(articuloId); // 404 if the item doesn't exist.
      throw new NotFoundException('El artículo no tiene un envase abierto');
    }
  }

  // --- helpers ---

  // Locks the item's row until the transaction ends, like a stock movement: a change of tipoPeso
  // (which finishes the container) waits, and so does another open. 404 if it doesn't exist or is
  // inactive.
  private async articuloBloqueado(
    tx: Prisma.TransactionClient,
    articuloId: number,
  ): Promise<{ pesoInicial: Prisma.Decimal; tipoPeso: UnidadInsumo }> {
    const filas = await tx.$queryRaw<
      { pesoInicial: string; tipoPeso: UnidadInsumo; fechaBaja: Date | null }[]
    >`
      SELECT CAST(pesoInicial AS CHAR) AS pesoInicial, tipoPeso, fechaBaja
      FROM Articulo WHERE id = ${articuloId} FOR UPDATE`;
    const fila = filas[0];
    if (!fila || fila.fechaBaja !== null) {
      throw new NotFoundException('Artículo no encontrado');
    }
    return {
      pesoInicial: new Prisma.Decimal(fila.pesoInicial),
      tipoPeso: fila.tipoPeso,
    };
  }
}
