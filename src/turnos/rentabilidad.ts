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

/** Cost of the services that match `detalles`. Read it with `costoDe`. */
export async function costosPorDetalle(
  prisma: PrismaService,
  detalles: Prisma.TurnoDetalleWhereInput,
): Promise<Map<number, CostoDeDetalle>> {
  const insumos = await prisma.formulaInsumo.findMany({
    where: {
      formula: { ficha: { turnoDetalle: detalles, fechaBaja: null } },
    },
    select: {
      costoSubtotal: true,
      formula: { select: { ficha: { select: { turnoDetalleId: true } } } },
    },
  });
  const costos = new Map<number, CostoDeDetalle>();
  for (const { costoSubtotal, formula } of insumos) {
    const id = formula.ficha.turnoDetalleId;
    const actual = costoDe(costos, id);
    costos.set(id, {
      costo: costoSubtotal ? actual.costo.plus(costoSubtotal) : actual.costo,
      costoIncompleto: actual.costoIncompleto || costoSubtotal === null,
    });
  }
  return costos;
}

/** A service without a record or supplies costs 0 (e.g. a haircut). */
export function costoDe(
  costos: Map<number, CostoDeDetalle>,
  detalleId: number,
): CostoDeDetalle {
  return costos.get(detalleId) ?? SIN_COSTO;
}
