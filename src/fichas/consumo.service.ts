import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MAX_DECIMAL_10_2,
  MAX_DECIMAL_10_3,
} from '../articulos/dto/create-articulo.dto';
import { EstadoRemito, Prisma, TipoRemito } from '../generated/prisma/client';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

// What a record's supplies used, per item, in the item's tipoPeso (g, ml or units).
export type GramosPorArticulo = Map<number, Decimal>;

export type ArticuloSinStock = { id: number; nombre: string; stock: string };

type ArticuloBloqueado = {
  id: number;
  nombre: string;
  stock: Decimal;
  precioCosto: Decimal;
  pesoInicial: Decimal;
};

function sumar(mapa: Map<number, Decimal>, id: number, valor: Decimal) {
  mapa.set(id, (mapa.get(id) ?? new Decimal(0)).plus(valor));
}

// Supplies without an item don't count.
export function gramosPorArticulo(
  insumos: { articuloId: number | null; cantidad: Decimal | null }[],
): GramosPorArticulo {
  const gramos: GramosPorArticulo = new Map();
  for (const { articuloId, cantidad } of insumos) {
    if (articuloId != null) {
      sumar(gramos, articuloId, cantidad ?? new Decimal(0));
    }
  }
  return gramos;
}

// F11 consumption of the technical records (PWA-176): the stock follows what their supplies with an
// item say. Each record's CONSUMO movements (Remito.fichaId) add up to what it has discounted so far,
// so an edit only moves the difference, even if the item's pesoInicial changed in between.
@Injectable()
export class ConsumoService {
  // Inside the caller's transaction. gramosAntes: what each record's supplies said before an edit
  // (empty when the turno is completed), for the open container. Returns the items it left below 0.
  async ajustar(
    tx: Prisma.TransactionClient,
    fichas: { id: number; gramosAntes?: GramosPorArticulo }[],
  ): Promise<ArticuloSinStock[]> {
    if (!fichas.length) {
      return [];
    }
    const fichaIds = fichas.map((f) => f.id);
    // Records first and then items, both in id order, so two transactions never wait for each other in a circle.
    await tx.$queryRaw`
      SELECT id FROM FichaTecnica WHERE id IN (${Prisma.join(fichaIds)}) ORDER BY id FOR UPDATE`;
    const datos = await tx.fichaTecnica.findMany({
      where: { id: { in: fichaIds } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        turnoDetalle: {
          select: { profesional: { select: { usuarioId: true } } },
        },
        formulas: {
          select: {
            insumos: {
              where: { articuloId: { not: null } },
              select: { id: true, articuloId: true, cantidad: true },
            },
          },
        },
      },
    });
    const movimientos = await tx.remitoDetalle.findMany({
      where: { remito: { fichaId: { in: fichaIds } } },
      select: {
        articuloId: true,
        cantidad: true,
        remito: { select: { fichaId: true } },
      },
    });

    // Containers already discounted, per record and item (positive).
    const descontado = new Map<number, Map<number, Decimal>>();
    for (const m of movimientos) {
      const fichaId = m.remito.fichaId!;
      if (!descontado.has(fichaId)) {
        descontado.set(fichaId, new Map());
      }
      sumar(descontado.get(fichaId)!, m.articuloId, m.cantidad.negated());
    }
    const articuloIds = new Set(movimientos.map((m) => m.articuloId));
    for (const ficha of datos) {
      for (const insumo of ficha.formulas.flatMap((f) => f.insumos)) {
        articuloIds.add(insumo.articuloId!);
      }
    }
    if (!articuloIds.size) {
      return [];
    }
    const articulos = await this.bloquearArticulos(tx, [...articuloIds]);

    // What the stock and the open container change by, for all the records together.
    const cambioStock = new Map<number, Decimal>();
    const cambioGramos = new Map<number, Decimal>();
    for (const ficha of datos) {
      const insumos = ficha.formulas.flatMap((f) => f.insumos);
      const gramos: GramosPorArticulo = new Map();
      for (const insumo of insumos) {
        const articulo = articulos.get(insumo.articuloId!)!;
        const cantidad = insumo.cantidad ?? new Decimal(0);
        sumar(gramos, articulo.id, cantidad);
        const costo = articulo.precioCosto
          .div(articulo.pesoInicial)
          .times(cantidad)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        if (costo.gt(MAX_DECIMAL_10_2)) {
          throw new BadRequestException(
            `El costo de ${articulo.nombre} en la ficha ${ficha.id} supera $99.999.999,99`,
          );
        }
        await tx.formulaInsumo.update({
          where: { id: insumo.id },
          data: { costoSubtotal: costo },
        });
      }

      const yaDescontado = descontado.get(ficha.id) ?? new Map();
      const gramosAntes = fichas.find((f) => f.id === ficha.id)?.gramosAntes;
      const detalles: { articuloId: number; cantidad: Decimal }[] = [];
      for (const id of new Set([...gramos.keys(), ...yaDescontado.keys()])) {
        const articulo = articulos.get(id)!;
        const usados = gramos.get(id) ?? new Decimal(0);
        const debido = usados
          .div(articulo.pesoInicial)
          .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
        const diferencia = debido.minus(yaDescontado.get(id) ?? 0);
        sumar(cambioGramos, id, usados.minus(gramosAntes?.get(id) ?? 0));
        if (diferencia.isZero()) {
          continue;
        }
        if (diferencia.abs().gt(MAX_DECIMAL_10_3)) {
          throw new BadRequestException(
            `El consumo de ${articulo.nombre} en la ficha ${ficha.id} supera los 9.999.999,999 envases`,
          );
        }
        detalles.push({ articuloId: id, cantidad: diferencia.negated() });
        sumar(cambioStock, id, diferencia.negated());
      }
      if (detalles.length) {
        await tx.remito.create({
          data: {
            tipo: TipoRemito.CONSUMO,
            estado: EstadoRemito.APLICADO,
            motivo: `Ficha ${ficha.id}`,
            usuario: {
              connect: { id: ficha.turnoDetalle.profesional.usuarioId },
            },
            ficha: { connect: { id: ficha.id } },
            detalles: { create: detalles },
          },
        });
      }
    }

    const sinStock: ArticuloSinStock[] = [];
    for (const [id, cambio] of cambioStock) {
      if (cambio.isZero()) {
        continue;
      }
      const articulo = articulos.get(id)!;
      const stock = articulo.stock.plus(cambio);
      if (stock.abs().gt(MAX_DECIMAL_10_3)) {
        throw new BadRequestException(
          `El stock de ${articulo.nombre} no puede superar los 9.999.999,999 envases`,
        );
      }
      await tx.articulo.update({ where: { id }, data: { stock } });
      if (stock.isNegative()) {
        sinStock.push({ id, nombre: articulo.nombre, stock: stock.toString() });
      }
    }
    // Opening a container doesn't move stock (decided 01/11): it is informative, between 0 and full.
    // No row (no open container) → nothing to update.
    for (const [id, cambio] of cambioGramos) {
      if (cambio.isZero()) {
        continue;
      }
      await tx.$executeRaw`
        UPDATE ArticuloUso u JOIN Articulo a ON a.id = u.articuloId
        SET u.pesoActual = LEAST(GREATEST(u.pesoActual - CAST(${cambio.toString()} AS DECIMAL(12, 2)), 0), a.pesoInicial)
        WHERE u.articuloId = ${id}`;
    }
    return sinStock;
  }

  // Locks the items' rows until the transaction ends (like a manual movement). Also an inactive
  // item: what a record used was used anyway.
  private async bloquearArticulos(
    tx: Prisma.TransactionClient,
    ids: number[],
  ): Promise<Map<number, ArticuloBloqueado>> {
    const filas = await tx.$queryRaw<
      {
        id: number;
        nombre: string;
        stock: string;
        precioCosto: string;
        pesoInicial: string;
      }[]
    >`
      SELECT id, nombre, CAST(stock AS CHAR) AS stock, CAST(precioCosto AS CHAR) AS precioCosto,
        CAST(pesoInicial AS CHAR) AS pesoInicial
      FROM Articulo WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    return new Map(
      filas.map((f) => [
        Number(f.id),
        {
          id: Number(f.id),
          nombre: f.nombre,
          stock: new Decimal(f.stock),
          precioCosto: new Decimal(f.precioCosto),
          pesoInicial: new Decimal(f.pesoInicial),
        },
      ]),
    );
  }
}
