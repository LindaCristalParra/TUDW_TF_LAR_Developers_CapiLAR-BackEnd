import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  aHora,
  aMinutos,
  ahoraEnSalon,
  dateAFecha,
  esFechaValida,
  fechaADate,
} from '../common/fecha-hora';
import {
  EstadoSerie,
  EstadoTurno,
  FrecuenciaSerie,
  Prisma,
  Rol,
} from '../generated/prisma/client';
import { MailSerie, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ContextoAgenda,
  MAX_DIAS_ANTICIPACION,
  cargarContexto,
  horariosLibres,
  motivoNoDisponible,
} from '../turnos/agenda';
import { PublicUser } from '../users/users.service';
import { CreateSerieDto } from './dto/create-serie.dto';

type Db = Prisma.TransactionClient;

export const DIAS_FRECUENCIA: Record<FrecuenciaSerie, number> = {
  SEMANAL: 7,
  QUINCENAL: 14,
  CADA_20_DIAS: 20,
  MENSUAL: 28,
};

const TEXTO_FRECUENCIA: Record<FrecuenciaSerie, string> = {
  SEMANAL: 'cada semana',
  QUINCENAL: 'cada 2 semanas',
  CADA_20_DIAS: 'cada 20 días',
  MENSUAL: 'cada 4 semanas',
};

// Free times listed per date in the client's email (the app shows them all).
const MAX_HORARIOS_EN_MAIL = 6;

/**
 * LIBRE: the turno fits. SIN_HORARIO: the professional has no working hours loaded that day;
 * the turno is created anyway and they are asked to load them. OCUPADA: taken, or outside the
 * hours loaded that day; no turno, the client picks another time of that day from the app.
 */
export type EstadoFecha = 'LIBRE' | 'SIN_HORARIO' | 'OCUPADA';

interface FechaPlanificada {
  fecha: string;
  estado: EstadoFecha;
  motivo: string | null;
  // Only for OCUPADA: other start times that day.
  horariosLibres: string[];
  ctx: ContextoAgenda;
}

/** Everything needed to show or create a series, checked against the agenda of each date. */
interface PlanSerie {
  turnoOrigenId: number;
  clienteId: number;
  cliente: { nombre: string; apellido: string; email: string };
  legajo: number;
  profesional: { nombre: string; apellido: string; email: string };
  servicioId: number;
  servicio: string;
  frecuencia: FrecuenciaSerie;
  horaInicio: string;
  fechaFin: string;
  fechas: FechaPlanificada[];
}

// Serializable, like booking a turno: nobody can take one of the dates meanwhile.
const TX_SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

/** "2026-10-07" + 7 -> "2026-10-14" */
function sumarDias(fecha: string, dias: number): string {
  const date = fechaADate(fecha);
  date.setUTCDate(date.getUTCDate() + dias);
  return dateAFecha(date);
}

@Injectable()
export class SeriesService {
  private readonly logger = new Logger(SeriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /** What would happen on each date, without creating anything. */
  async vistaPrevia(dto: CreateSerieDto, actor: PublicUser) {
    return this.formatearPlan(await this.planificar(this.prisma, dto, actor));
  }

  /** Creates the series and a CONFIRMADO turno on every LIBRE or SIN_HORARIO date. */
  async create(dto: CreateSerieDto, actor: PublicUser) {
    const { plan, serieId, turnoIds } = await this.enTransaccion(async (tx) => {
      const plan = await this.planificar(tx, dto, actor);
      const serie = await tx.serieTurno.create({
        data: {
          clienteId: plan.clienteId,
          profesionalId: plan.legajo,
          servicioId: plan.servicioId,
          frecuencia: plan.frecuencia,
          horaInicio: plan.horaInicio,
          fechaInicio: fechaADate(plan.fechas[0].fecha),
          fechaFin: fechaADate(plan.fechaFin),
          turnoOrigenId: plan.turnoOrigenId,
        },
      });
      const turnoIds = await this.crearTurnos(tx, serie.id, plan);
      return { plan, serieId: serie.id, turnoIds };
    });

    this.avisarCreada(plan);
    const { fechas, ...resto } = this.formatearPlan(plan);
    return {
      id: serieId,
      estado: EstadoSerie.ACTIVA,
      ...resto,
      fechas: fechas.map((f) => ({
        ...f,
        turnoId: turnoIds.get(f.fecha) ?? null,
      })),
    };
  }

  // One turno per LIBRE or SIN_HORARIO date (OCUPADA ones are booked by the client later).
  private async crearTurnos(
    tx: Db,
    serieId: number,
    plan: PlanSerie,
  ): Promise<Map<string, number>> {
    const turnoIds = new Map<string, number>();
    for (const f of plan.fechas) {
      if (f.estado === 'OCUPADA') continue;
      const turno = await tx.turno.create({
        data: {
          clienteId: plan.clienteId,
          fecha: fechaADate(f.fecha),
          horaInicio: plan.horaInicio,
          horaFin: aHora(aMinutos(plan.horaInicio) + f.ctx.duracionTotal),
          // Set up by the professional: no approval needed.
          estado: EstadoTurno.CONFIRMADO,
          serieId,
          detalles: {
            create: {
              servicioId: plan.servicioId,
              profesionalId: plan.legajo,
              precioBase: f.ctx.items[0].precio,
            },
          },
        },
      });
      turnoIds.set(f.fecha, turno.id);
    }
    return turnoIds;
  }

  // Checks the original turno and the end date, and classifies every date of the series.
  private async planificar(
    db: Db,
    dto: CreateSerieDto,
    actor: PublicUser,
  ): Promise<PlanSerie> {
    const turno = await db.turno.findUnique({
      where: { id: dto.turnoId },
      include: {
        detalles: {
          orderBy: { id: 'asc' },
          include: {
            servicio: { select: { tipo: true, tiempoDuracion: true } },
            profesional: {
              select: {
                usuario: {
                  select: { nombre: true, apellido: true, email: true },
                },
              },
            },
          },
        },
        cliente: {
          select: {
            usuario: {
              select: {
                nombre: true,
                apellido: true,
                email: true,
                fechaBaja: true,
              },
            },
          },
        },
        seriesOrigen: { where: { estado: { not: EstadoSerie.BAJA } } },
      },
    });
    if (!turno) {
      throw new NotFoundException('Turno no encontrado');
    }
    const legajo = actor.profesional?.legajo;
    const propios = turno.detalles.filter((d) => d.profesionalId === legajo);
    if (actor.rol !== Rol.PROFESIONAL || !propios.length) {
      throw new ForbiddenException(
        'Solo podés crear series de turnos de tu agenda',
      );
    }
    if (turno.estado !== EstadoTurno.CONFIRMADO) {
      throw new BadRequestException(
        'La serie se crea a partir de un turno confirmado',
      );
    }
    // Two series with the same dates would book them twice.
    if (turno.serieId !== null || turno.seriesOrigen.length) {
      throw new ConflictException('Este turno ya es parte de una serie');
    }
    if (turno.cliente.usuario.fechaBaja !== null) {
      throw new BadRequestException('El cliente está dado de baja');
    }

    let detalle = propios[0];
    if (dto.turnoDetalleId) {
      const elegido = propios.find((d) => d.id === dto.turnoDetalleId);
      if (!elegido) {
        throw new BadRequestException(
          'Ese servicio no es de este turno o no lo hacés vos',
        );
      }
      detalle = elegido;
    } else if (propios.length > 1) {
      throw new BadRequestException(
        'El turno tiene varios servicios tuyos: indicá cuál se repite (turnoDetalleId)',
      );
    }

    // Services are done one after another: this one starts after the previous ones.
    let minuto = aMinutos(turno.horaInicio);
    for (const d of turno.detalles) {
      if (d.id === detalle.id) break;
      minuto += d.servicio.tiempoDuracion;
    }
    const horaInicio = aHora(minuto);

    const fechas = this.fechasDeLaSerie(
      dateAFecha(turno.fecha),
      dto.frecuencia,
      dto.fechaFin,
    );
    const items = [
      { servicioId: detalle.servicioId, legajo: detalle.profesionalId },
    ];
    const planificadas: FechaPlanificada[] = [];
    for (const fecha of fechas) {
      const ctx = await cargarContexto(db, fecha, items, {
        clienteId: turno.clienteId,
      });
      const { estado, motivo } = this.clasificar(
        ctx,
        horaInicio,
        detalle.profesionalId,
      );
      planificadas.push({
        fecha,
        estado,
        motivo,
        horariosLibres: estado === 'OCUPADA' ? horariosLibres(ctx) : [],
        ctx,
      });
    }

    return {
      turnoOrigenId: turno.id,
      clienteId: turno.clienteId,
      cliente: turno.cliente.usuario,
      legajo: detalle.profesionalId,
      profesional: detalle.profesional.usuario,
      servicioId: detalle.servicioId,
      servicio: detalle.servicio.tipo,
      frecuencia: dto.frecuencia,
      horaInicio,
      fechaFin: dto.fechaFin,
      fechas: planificadas,
    };
  }

  // The original turno's date + N, + 2N... up to fechaFin; only dates after today.
  private fechasDeLaSerie(
    fechaOrigen: string,
    frecuencia: FrecuenciaSerie,
    fechaFin: string,
  ): string[] {
    if (!esFechaValida(fechaFin)) {
      throw new BadRequestException('La fecha de fin no es válida');
    }
    const hoy = ahoraEnSalon().fecha;
    if (fechaFin > sumarDias(hoy, MAX_DIAS_ANTICIPACION)) {
      throw new BadRequestException(
        `La serie puede llegar hasta ${MAX_DIAS_ANTICIPACION} días desde hoy`,
      );
    }
    const dias = DIAS_FRECUENCIA[frecuencia];
    const fechas: string[] = [];
    for (
      let fecha = sumarDias(fechaOrigen, dias);
      fecha <= fechaFin;
      fecha = sumarDias(fecha, dias)
    ) {
      if (fecha > hoy) fechas.push(fecha);
    }
    if (!fechas.length) {
      throw new BadRequestException(
        'Con esa fecha de fin la serie no tiene ninguna fecha',
      );
    }
    return fechas;
  }

  private clasificar(
    ctx: ContextoAgenda,
    horaInicio: string,
    legajo: number,
  ): { estado: EstadoFecha; motivo: string | null } {
    const inicio = aMinutos(horaInicio);
    const motivo = motivoNoDisponible(ctx, inicio);
    if (!motivo) {
      return { estado: 'LIBRE', motivo: null };
    }
    if (ctx.disponibilidad.get(legajo)?.length) {
      return { estado: 'OCUPADA', motivo };
    }
    // No hours loaded that day: it still has to be free of other turnos (theirs and the client's).
    const diaCompleto: ContextoAgenda = {
      ...ctx,
      disponibilidad: new Map([[legajo, [{ inicio: 0, fin: 24 * 60 }]]]),
    };
    const ocupada = motivoNoDisponible(diaCompleto, inicio);
    if (ocupada) {
      return { estado: 'OCUPADA', motivo: ocupada };
    }
    return {
      estado: 'SIN_HORARIO',
      motivo: `${ctx.items[0].profesional} todavía no cargó su horario de ese día`,
    };
  }

  private formatearPlan(plan: PlanSerie) {
    return {
      turnoOrigenId: plan.turnoOrigenId,
      cliente: {
        id: plan.clienteId,
        nombre: plan.cliente.nombre,
        apellido: plan.cliente.apellido,
      },
      legajo: plan.legajo,
      profesional: `${plan.profesional.nombre} ${plan.profesional.apellido}`,
      servicioId: plan.servicioId,
      servicio: plan.servicio,
      frecuencia: plan.frecuencia,
      horaInicio: plan.horaInicio,
      fechaInicio: plan.fechas[0].fecha,
      fechaFin: plan.fechaFin,
      fechas: plan.fechas.map((f) => ({
        fecha: f.fecha,
        estado: f.estado,
        motivo: f.motivo,
        horariosLibres: f.horariosLibres,
      })),
    };
  }

  // The client gets every date; the professional, the days without working hours (if any).
  private avisarCreada(plan: PlanSerie): void {
    const profesional = `${plan.profesional.nombre} ${plan.profesional.apellido}`;
    const resumen = `${plan.servicio} con ${profesional}, ${TEXTO_FRECUENCIA[plan.frecuencia]} a las ${plan.horaInicio}`;
    const ocupadas = plan.fechas.some((f) => f.estado === 'OCUPADA');

    this.enviar(plan.cliente.email, 'Tus próximos turnos', {
      titulo: 'Tus próximos turnos',
      nombre: plan.cliente.nombre,
      mensaje: ocupadas
        ? `${profesional} te reservó estos turnos. Algunos días no hay lugar a las ${plan.horaInicio}: entrá a la app y elegí otro horario de ese día.`
        : `${profesional} te reservó estos turnos. Si alguno no te queda cómodo, podés cancelarlo desde la app.`,
      resumen,
      fechas: plan.fechas.map((f) => ({
        fecha: this.fechaLarga(f.fecha),
        detalle: this.detalleParaCliente(f, plan.horaInicio),
      })),
      boton: 'VER MIS TURNOS',
      ruta: '/mis-turnos',
    });

    const sinHorario = plan.fechas.filter((f) => f.estado === 'SIN_HORARIO');
    if (sinHorario.length) {
      this.enviar(plan.profesional.email, 'Completá tu agenda', {
        titulo: 'Completá tu agenda',
        nombre: plan.profesional.nombre,
        mensaje: `Los turnos de ${plan.cliente.nombre} ${plan.cliente.apellido} ya quedaron reservados, pero estos días todavía no tienen tu horario cargado. Cargalo desde tu agenda.`,
        resumen,
        fechas: sinHorario.map((f) => ({
          fecha: this.fechaLarga(f.fecha),
          detalle: `${plan.horaInicio} · Sin horario cargado`,
        })),
        boton: 'IR A MI AGENDA',
        ruta: '/agenda',
      });
    }
  }

  private detalleParaCliente(f: FechaPlanificada, hora: string): string {
    if (f.estado !== 'OCUPADA') {
      return `${hora} · Confirmado`;
    }
    if (!f.horariosLibres.length) {
      return `Sin lugar a las ${hora}. Por ahora no hay otros horarios ese día`;
    }
    const horarios = f.horariosLibres.slice(0, MAX_HORARIOS_EN_MAIL).join(', ');
    const mas = f.horariosLibres.length > MAX_HORARIOS_EN_MAIL ? ' y más' : '';
    return `Sin lugar a las ${hora}. Libres: ${horarios}${mas}`;
  }

  // Not awaited: a slow or failed email must not delay or break the request.
  private enviar(email: string, asunto: string, contenido: MailSerie): void {
    this.mailService.sendSerie(email, asunto, contenido).catch((error) => {
      this.logger.error(
        `Could not send "${asunto}" to ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  private async enTransaccion<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, TX_SERIALIZABLE);
    } catch (error) {
      // P2034: write conflict or deadlock with a booking made at the same time.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Alguien estaba reservando en esas fechas. Probá de nuevo.',
        );
      }
      throw error;
    }
  }

  /** "2026-10-07" -> "martes 7 de octubre" */
  private fechaLarga(fecha: string): string {
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(fechaADate(fecha));
  }
}
