import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// F12 (PWA-220): material cost of each service of a turno, from its active record.
export interface CostoDeDetalle {
  // Sum of the supplies' costoSubtotal (set when the turno is completed).
  costo: Prisma.Decimal;
  // A supply without cost (free text): the cost is lower than the real one.
  costoIncompleto: boolean;
}

const SIN_COSTO: CostoDeDetalle = {
  costo: new Prisma.Decimal(0),
  costoIncompleto: false,
};

/** Cost of each service; a service without a record or supplies costs 0. */
export async function costosPorDetalle(
  prisma: PrismaService,
  detalleIds: number[],
): Promise<Map<number, CostoDeDetalle>> {
  const costos = new Map(detalleIds.map((id) => [id, { ...SIN_COSTO }]));
  if (!detalleIds.length) {
    return costos;
  }
  const insumos = await prisma.formulaInsumo.findMany({
    where: {
      formula: {
        ficha: { turnoDetalleId: { in: detalleIds }, fechaBaja: null },
      },
    },
    select: {
      costoSubtotal: true,
      formula: { select: { ficha: { select: { turnoDetalleId: true } } } },
    },
  });
  for (const { costoSubtotal, formula } of insumos) {
    const actual = costos.get(formula.ficha.turnoDetalleId)!;
    costos.set(formula.ficha.turnoDetalleId, {
      costo: costoSubtotal ? actual.costo.plus(costoSubtotal) : actual.costo,
      costoIncompleto: actual.costoIncompleto || costoSubtotal === null,
    });
  }
  return costos;
}
