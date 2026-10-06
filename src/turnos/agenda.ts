import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoTurno, Prisma } from '../generated/prisma/client';
import {
  aHora,
  aMinutos,
  ahoraEnSalon,
  dateAFecha,
  esFechaValida,
  fechaADate,
  seSuperponen,
} from '../common/fecha-hora';
import {
  MAX_DURACION_TURNO,
  PASO_HORARIOS,
  ROLES_QUE_ATIENDEN,
} from '../common/reglas-agenda';

// Booking rules (decided by the salon).
export const MAX_DIAS_ANTICIPACION = 60;
export const MIN_MINUTOS_ANTICIPACION = 60;

// States that keep the time slot taken. RECHAZADO and CANCELADO free it.
export const ESTADOS_OCUPAN: EstadoTurno[] = [
  EstadoTurno.PENDIENTE,
  EstadoTurno.CONFIRMADO,
  EstadoTurno.REPROGRAMADO,
  EstadoTurno.COMPLETADO,
];

type Db = Prisma.TransactionClient;

/** One service of a turno, done by one professional. */
export interface ItemTurno {
  servicioId: number;
  legajo: number;
}

/** Item with its service loaded, in the order it will be done. */
export interface ItemResuelto extends ItemTurno {
  tipo: string;
  profesional: string;
  duracion: number;
  precio: Prisma.Decimal;
}

/** Minutes of the day a professional is busy with a turno. */
interface Tramo {
  legajo: number;
  inicio: number;
  fin: number;
}

/** Everything needed to check start times for one date, loaded once. */
export interface ContextoAgenda {
  fecha: string;
  items: ItemResuelto[];
  duracionTotal: number;
  // legajo -> working ranges for that weekday, in minutes
  disponibilidad: Map<number, { inicio: number; fin: number }[]>;
  // legajo -> blocked ranges for that date, in minutes (clipped to the day)
  bloqueos: Map<number, { inicio: number; fin: number }[]>;
  ocupados: Tramo[];
  // the client's own turnos that day (whole windows), if a client is given
  turnosDelCliente: { inicio: number; fin: number }[];
  // true when the client books for themselves (changes the overlap message)
  reservaElCliente: boolean;
}

/** Validates services and professionals and returns them in order. */
export async function resolverItems(
  db: Db,
  items: ItemTurno[],
): Promise<ItemResuelto[]> {
  const servicioIds = [...new Set(items.map((i) => i.servicioId))];
  const servicios = await db.servicio.findMany({
    where: { id: { in: servicioIds }, fechaBaja: null },
  });
  const legajos = [...new Set(items.map((i) => i.legajo))];
  const profesionales = await db.profesional.findMany({
    where: {
      legajo: { in: legajos },
      usuario: { rol: { in: ROLES_QUE_ATIENDEN }, fechaBaja: null },
    },
    select: {
      legajo: true,
      usuario: { select: { nombre: true, apellido: true } },
    },
  });
  const asignados = await db.profesionalServicio.findMany({
    where: {
      profesionalId: { in: legajos },
      servicioId: { in: servicioIds },
      fechaBaja: null,
    },
  });

  return items.map((item) => {
    const servicio = servicios.find((s) => s.id === item.servicioId);
    if (!servicio) {
      throw new NotFoundException(`Servicio ${item.servicioId} no encontrado`);
    }
    const profesional = profesionales.find((p) => p.legajo === item.legajo);
    if (!profesional) {
      throw new NotFoundException(`Profesional ${item.legajo} no encontrado`);
    }
    const nombre = `${profesional.usuario.nombre} ${profesional.usuario.apellido}`;
    if (
      !asignados.some(
        (a) =>
          a.profesionalId === item.legajo && a.servicioId === item.servicioId,
      )
    ) {
      throw new BadRequestException(
        `${nombre} no realiza el servicio ${servicio.tipo}`,
      );
    }
    return {
      ...item,
      tipo: servicio.tipo,
      profesional: nombre,
      duracion: servicio.tiempoDuracion,
      precio: servicio.precio,
    };
  });
}

/** Busy ranges of the given professionals on a date, rebuilt from each turno's detalles. */
export async function tramosOcupados(
  db: Db,
  legajos: number[],
  fecha: string,
  excluirTurnoId?: number,
): Promise<Tramo[]> {
  const turnos = await db.turno.findMany({
    where: {
      fecha: fechaADate(fecha),
      estado: { in: ESTADOS_OCUPAN },
      id: excluirTurnoId ? { not: excluirTurnoId } : undefined,
      detalles: { some: { profesionalId: { in: legajos } } },
    },
    include: {
      detalles: { orderBy: { id: 'asc' }, include: { servicio: true } },
    },
  });

  const tramos: Tramo[] = [];
  for (const turno of turnos) {
    let inicio = aMinutos(turno.horaInicio);
    for (const detalle of turno.detalles) {
      const fin = inicio + detalle.servicio.tiempoDuracion;
      if (legajos.includes(detalle.profesionalId)) {
        tramos.push({ legajo: detalle.profesionalId, inicio, fin });
      }
      inicio = fin;
    }
  }
  return tramos;
}

/** 400 if the date is not a real date or is outside the booking window. */
export function validarFecha(fecha: string): void {
  if (!esFechaValida(fecha)) {
    throw new BadRequestException('La fecha no es válida');
  }
  const hoy = ahoraEnSalon().fecha;
  const limite = new Date(fechaADate(hoy));
  limite.setUTCDate(limite.getUTCDate() + MAX_DIAS_ANTICIPACION);
  if (fecha < hoy) {
    throw new BadRequestException('La fecha ya pasó');
  }
  if (fecha > dateAFecha(limite)) {
    throw new BadRequestException(
      `Solo se puede reservar hasta ${MAX_DIAS_ANTICIPACION} días adelante`,
    );
  }
}

export async function cargarContexto(
  db: Db,
  fecha: string,
  items: ItemTurno[],
  opciones: {
    excluirTurnoId?: number;
    clienteId?: number;
    reservaElCliente?: boolean;
  } = {},
): Promise<ContextoAgenda> {
  validarFecha(fecha);
  const resueltos = await resolverItems(db, items);
  const duracionTotal = resueltos.reduce((t, i) => t + i.duracion, 0);
  if (duracionTotal > MAX_DURACION_TURNO) {
    throw new BadRequestException('Un turno no puede durar más de 7 horas');
  }

  const legajos = [...new Set(items.map((i) => i.legajo))];
  const inicioDia = fechaADate(fecha);
  const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);

  const [horarios, bloqueos, ocupados, delCliente] = await Promise.all([
    db.disponibilidadHoraria.findMany({
      where: {
        profesionalId: { in: legajos },
        fecha: inicioDia,
        fechaBaja: null,
      },
    }),
    db.bloqueoAgenda.findMany({
      where: {
        profesionalId: { in: legajos },
        fechaBaja: null,
        fechaInicio: { lt: finDia },
        fechaFin: { gt: inicioDia },
      },
    }),
    tramosOcupados(db, legajos, fecha, opciones.excluirTurnoId),
    opciones.clienteId
      ? db.turno.findMany({
          where: {
            clienteId: opciones.clienteId,
            fecha: inicioDia,
            estado: { in: ESTADOS_OCUPAN },
            id: opciones.excluirTurnoId
              ? { not: opciones.excluirTurnoId }
              : undefined,
          },
        })
      : Promise.resolve([]),
  ]);

  const disponibilidad = new Map<number, { inicio: number; fin: number }[]>();
  for (const h of horarios) {
    const lista = disponibilidad.get(h.profesionalId) ?? [];
    lista.push({
      inicio: aMinutos(h.horarioInicio),
      fin: aMinutos(h.horarioFin),
    });
    disponibilidad.set(h.profesionalId, lista);
  }

  // Block date-times are stored as local wall-clock in UTC, like inicioDia.
  const bloqueosPorLegajo = new Map<
    number,
    { inicio: number; fin: number }[]
  >();
  for (const b of bloqueos) {
    const inicio = Math.max(
      0,
      (b.fechaInicio.getTime() - inicioDia.getTime()) / 60000,
    );
    const fin = Math.min(
      24 * 60,
      (b.fechaFin.getTime() - inicioDia.getTime()) / 60000,
    );
    const lista = bloqueosPorLegajo.get(b.profesionalId) ?? [];
    lista.push({ inicio, fin });
    bloqueosPorLegajo.set(b.profesionalId, lista);
  }

  return {
    fecha,
    items: resueltos,
    duracionTotal,
    disponibilidad,
    bloqueos: bloqueosPorLegajo,
    ocupados,
    turnosDelCliente: delCliente.map((t) => ({
      inicio: aMinutos(t.horaInicio),
      fin: aMinutos(t.horaFin),
    })),
    reservaElCliente: opciones.reservaElCliente ?? false,
  };
}

/** Why a start time doesn't work, or null when it does. */
export function motivoNoDisponible(
  ctx: ContextoAgenda,
  inicioTurno: number,
): string | null {
  const finTurno = inicioTurno + ctx.duracionTotal;
  if (finTurno > 24 * 60) {
    return 'El turno no puede terminar después de la medianoche';
  }

  const ahora = ahoraEnSalon();
  if (
    ctx.fecha === ahora.fecha &&
    inicioTurno < ahora.minutos + MIN_MINUTOS_ANTICIPACION
  ) {
    return 'El turno tiene que reservarse con al menos 1 hora de anticipación';
  }

  if (
    ctx.turnosDelCliente.some((t) =>
      seSuperponen(inicioTurno, finTurno, t.inicio, t.fin),
    )
  ) {
    return ctx.reservaElCliente
      ? 'Ya tenés otro turno en ese horario'
      : 'El cliente ya tiene otro turno en ese horario';
  }

  let inicio = inicioTurno;
  for (const item of ctx.items) {
    const fin = inicio + item.duracion;
    const trabaja = (ctx.disponibilidad.get(item.legajo) ?? []).some(
      (h) => h.inicio <= inicio && fin <= h.fin,
    );
    if (!trabaja) {
      return `${item.profesional} no atiende de ${aHora(inicio)} a ${aHora(fin)}`;
    }
    if (
      (ctx.bloqueos.get(item.legajo) ?? []).some((b) =>
        seSuperponen(inicio, fin, b.inicio, b.fin),
      )
    ) {
      return `${item.profesional} no está disponible de ${aHora(inicio)} a ${aHora(fin)}`;
    }
    if (
      ctx.ocupados.some(
        (t) =>
          t.legajo === item.legajo &&
          seSuperponen(inicio, fin, t.inicio, t.fin),
      )
    ) {
      return `${item.profesional} ya tiene un turno de ${aHora(inicio)} a ${aHora(fin)}`;
    }
    inicio = fin;
  }
  return null;
}

/** Start times ("HH:mm") that work for the whole turno, every PASO_HORARIOS minutes. */
export function horariosLibres(ctx: ContextoAgenda): string[] {
  const libres: string[] = [];
  for (
    let inicio = 0;
    inicio + ctx.duracionTotal <= 24 * 60;
    inicio += PASO_HORARIOS
  ) {
    if (motivoNoDisponible(ctx, inicio) === null) {
      libres.push(aHora(inicio));
    }
  }
  return libres;
}

/** 409 with the reason when the start time doesn't work. */
export function assertDisponible(
  ctx: ContextoAgenda,
  horaInicio: string,
): void {
  const motivo = motivoNoDisponible(ctx, aMinutos(horaInicio));
  if (motivo) {
    throw new ConflictException(motivo);
  }
}
