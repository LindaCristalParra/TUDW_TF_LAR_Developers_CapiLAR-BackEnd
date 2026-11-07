import { BadRequestException, Injectable } from '@nestjs/common';
import { esFechaValida, fechaADate } from '../common/fecha-hora';
import { EstadoTurno, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { costoDe, costosPorDetalle } from '../turnos/rentabilidad';
import { RentabilidadQueryDto } from './dto/rentabilidad-query.dto';

// A year, leap or not.
export const MAX_DIAS_REPORTE = 366;

interface Acumulado {
  // Services done (TurnoDetalle).
  cantidad: number;
  cobrado: Prisma.Decimal;
  costo: Prisma.Decimal;
  // Services with a free-text supply: their cost is lower than the real one.
  conCostoIncompleto: number;
}

const vacio = (): Acumulado => ({
  cantidad: 0,
  cobrado: new Prisma.Decimal(0),
  costo: new Prisma.Decimal(0),
  conCostoIncompleto: 0,
});

const conMargen = <T extends Acumulado>(a: T) => ({
  ...a,
  margen: a.cobrado.minus(a.costo),
});

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  // F12 (PWA-220): what the completed turnos of a period charged, cost in materials and left.
  async rentabilidad(query: RentabilidadQueryDto) {
    if (!esFechaValida(query.desde) || !esFechaValida(query.hasta)) {
      throw new BadRequestException('Las fechas no son válidas');
    }
    if (query.desde > query.hasta) {
      throw new BadRequestException(
        'desde tiene que ser anterior o igual a hasta',
      );
    }
    const dias =
      (fechaADate(query.hasta).getTime() - fechaADate(query.desde).getTime()) /
      86_400_000;
    if (dias >= MAX_DIAS_REPORTE) {
      throw new BadRequestException(
        `El reporte se consulta de a ${MAX_DIAS_REPORTE} días como máximo`,
      );
    }

    const donde: Prisma.TurnoDetalleWhereInput = {
      turno: {
        estado: EstadoTurno.COMPLETADO,
        fecha: { gte: fechaADate(query.desde), lte: fechaADate(query.hasta) },
      },
      profesionalId: query.legajo,
      servicioId: query.servicioId,
    };
    const [detalles, costos] = await Promise.all([
      this.prisma.turnoDetalle.findMany({
        where: donde,
        select: {
          id: true,
          turnoId: true,
          precioBase: true,
          precioFinal: true,
          servicioId: true,
          servicio: { select: { tipo: true } },
          profesionalId: true,
          profesional: {
            select: { usuario: { select: { nombre: true, apellido: true } } },
          },
        },
      }),
      costosPorDetalle(this.prisma, donde),
    ]);

    const total = vacio();
    const porServicio = new Map<number, Acumulado & { servicio: string }>();
    const porProfesional = new Map<
      number,
      Acumulado & { profesional: string }
    >();
    for (const d of detalles) {
      const { costo, costoIncompleto } = costoDe(costos, d.id);
      const servicio = porServicio.get(d.servicioId) ?? {
        ...vacio(),
        servicio: d.servicio.tipo,
      };
      const { nombre, apellido } = d.profesional.usuario;
      const profesional = porProfesional.get(d.profesionalId) ?? {
        ...vacio(),
        profesional: `${nombre} ${apellido}`,
      };
      for (const a of [total, servicio, profesional]) {
        a.cantidad++;
        // precioFinal is set when completing (and by the migration for older turnos).
        a.cobrado = a.cobrado.plus(d.precioFinal ?? d.precioBase);
        a.costo = a.costo.plus(costo);
        a.conCostoIncompleto += costoIncompleto ? 1 : 0;
      }
      porServicio.set(d.servicioId, servicio);
      porProfesional.set(d.profesionalId, profesional);
    }

    const porNombre = (a: string, b: string) => a.localeCompare(b, 'es');
    return {
      desde: query.desde,
      hasta: query.hasta,
      total: {
        turnos: new Set(detalles.map((d) => d.turnoId)).size,
        ...conMargen(total),
      },
      porServicio: [...porServicio]
        .map(([servicioId, a]) => ({ servicioId, ...conMargen(a) }))
        .sort((a, b) => porNombre(a.servicio, b.servicio)),
      porProfesional: [...porProfesional]
        .map(([legajo, a]) => ({ legajo, ...conMargen(a) }))
        .sort((a, b) => porNombre(a.profesional, b.profesional)),
    };
  }
}
