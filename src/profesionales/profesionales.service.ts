import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BloqueoAgenda,
  DisponibilidadHoraria,
  Rol,
  Servicio,
} from '../generated/prisma/client';
import {
  aMinutos,
  ahoraEnSalon,
  dateAFecha,
  esFechaValida,
  fechaADate,
  fechaCorta,
  fechaHoraADate,
  seSuperponen,
} from '../common/fecha-hora';
import { MAX_JORNADA } from '../common/reglas-agenda';
import { PrismaService } from '../prisma/prisma.service';
import {
  ESTADOS_OCUPAN,
  MAX_DIAS_ANTICIPACION,
  tramosOcupados,
} from '../turnos/agenda';
import { PublicUser } from '../users/users.service';
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';
import { CreateDisponibilidadDto } from './dto/create-disponibilidad.dto';

// Longest period (in days) a schedule query can cover, like the turnos agenda.
const MAX_DIAS_CONSULTA = 31;

export interface ProfesionalResumen {
  legajo: number;
  nombre: string;
  apellido: string;
}

/** Working hours of one date. */
export interface HorarioDeTrabajo {
  id: number;
  // "YYYY-MM-DD"
  fecha: string;
  horarioInicio: string;
  horarioFin: string;
}

@Injectable()
export class ProfesionalesService {
  constructor(private readonly prisma: PrismaService) {}

  // Active professionals, for clients to choose who to book with.
  // With servicioId, only the ones who do that service.
  async findAll(servicioId?: number): Promise<ProfesionalResumen[]> {
    const profesionales = await this.prisma.profesional.findMany({
      where: {
        usuario: { rol: Rol.PROFESIONAL, fechaBaja: null },
        servicios: servicioId
          ? {
              some: {
                servicioId,
                fechaBaja: null,
                servicio: { fechaBaja: null },
              },
            }
          : undefined,
      },
      select: {
        legajo: true,
        usuario: { select: { nombre: true, apellido: true } },
      },
      orderBy: [
        { usuario: { apellido: 'asc' } },
        { usuario: { nombre: 'asc' } },
      ],
    });
    return profesionales.map(({ legajo, usuario }) => ({
      legajo,
      ...usuario,
    }));
  }

  /** 404 unless the legajo belongs to an active user whose current role is PROFESIONAL. */
  async assertActivo(legajo: number): Promise<void> {
    const profesional = await this.prisma.profesional.findUnique({
      where: { legajo },
      select: { usuario: { select: { rol: true, fechaBaja: true } } },
    });
    if (
      !profesional ||
      profesional.usuario.rol !== Rol.PROFESIONAL ||
      profesional.usuario.fechaBaja !== null
    ) {
      throw new NotFoundException('Profesional no encontrado');
    }
  }

  // Active services the professional does.
  findServicios(legajo: number): Promise<Servicio[]> {
    return this.prisma.servicio.findMany({
      where: {
        fechaBaja: null,
        profesionales: { some: { profesionalId: legajo, fechaBaja: null } },
      },
      orderBy: { tipo: 'asc' },
    });
  }

  // Assigning a service that was removed before clears its fechaBaja.
  async asignarServicio(legajo: number, servicioId: number): Promise<Servicio> {
    await this.assertActivo(legajo);
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: servicioId, fechaBaja: null },
    });
    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado');
    }

    const asignado = await this.prisma.profesionalServicio.findUnique({
      where: {
        profesionalId_servicioId: { profesionalId: legajo, servicioId },
      },
    });
    if (asignado && asignado.fechaBaja === null) {
      throw new ConflictException('El profesional ya tiene ese servicio');
    }
    await this.prisma.profesionalServicio.upsert({
      where: {
        profesionalId_servicioId: { profesionalId: legajo, servicioId },
      },
      create: { profesionalId: legajo, servicioId },
      update: { fechaBaja: null },
    });
    return servicio;
  }

  // Logical delete (ARQ-01). Turnos already booked with that service are kept.
  async quitarServicio(legajo: number, servicioId: number): Promise<void> {
    const result = await this.prisma.profesionalServicio.updateMany({
      where: { profesionalId: legajo, servicioId, fechaBaja: null },
      data: { fechaBaja: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('El profesional no tiene ese servicio');
    }
  }

  // Working hours between two dates (both included), by date and start time.
  async findDisponibilidad(
    legajo: number,
    desde: string,
    hasta: string,
  ): Promise<HorarioDeTrabajo[]> {
    if (!esFechaValida(desde) || !esFechaValida(hasta)) {
      throw new BadRequestException('Las fechas no son válidas');
    }
    if (desde > hasta) {
      throw new BadRequestException(
        'desde tiene que ser anterior o igual a hasta',
      );
    }
    const dias =
      (fechaADate(hasta).getTime() - fechaADate(desde).getTime()) / 86_400_000;
    if (dias >= MAX_DIAS_CONSULTA) {
      throw new BadRequestException(
        `Los horarios se consultan de a ${MAX_DIAS_CONSULTA} días como máximo`,
      );
    }

    const horarios = await this.prisma.disponibilidadHoraria.findMany({
      where: {
        profesionalId: legajo,
        fechaBaja: null,
        fecha: { gte: fechaADate(desde), lte: fechaADate(hasta) },
      },
      orderBy: [{ fecha: 'asc' }, { horarioInicio: 'asc' }],
    });
    return horarios.map((h) => this.formatearHorario(h));
  }

  // Same hours on several dates: every date is checked first, then all are saved together.
  async createDisponibilidad(
    legajo: number,
    dto: CreateDisponibilidadDto,
    actor: PublicUser,
  ): Promise<HorarioDeTrabajo[]> {
    this.assertPuedeGestionar(legajo, actor);
    await this.assertActivo(legajo);

    const inicio = aMinutos(dto.horarioInicio);
    const fin = aMinutos(dto.horarioFin);
    if (inicio >= fin) {
      throw new BadRequestException(
        'El horario de inicio tiene que ser anterior al de fin',
      );
    }
    const fechas = [...dto.fechas].sort();
    fechas.forEach((fecha) => this.validarFechaDeCarga(fecha));

    const cargados = await this.prisma.disponibilidadHoraria.findMany({
      where: {
        profesionalId: legajo,
        fechaBaja: null,
        fecha: { in: fechas.map(fechaADate) },
      },
    });
    for (const fecha of fechas) {
      const delDia = cargados.filter((h) => dateAFecha(h.fecha) === fecha);
      if (
        delDia.some((h) =>
          seSuperponen(
            inicio,
            fin,
            aMinutos(h.horarioInicio),
            aMinutos(h.horarioFin),
          ),
        )
      ) {
        throw new ConflictException(
          `El ${fechaCorta(fecha)} se superpone con otro horario cargado ese día`,
        );
      }
      const jornada = delDia.reduce(
        (total, h) =>
          total + aMinutos(h.horarioFin) - aMinutos(h.horarioInicio),
        fin - inicio,
      );
      if (jornada > MAX_JORNADA) {
        throw new BadRequestException(
          `El ${fechaCorta(fecha)} la jornada superaría las 12 horas`,
        );
      }
    }

    const creados = await this.prisma.$transaction(
      fechas.map((fecha) =>
        this.prisma.disponibilidadHoraria.create({
          data: {
            profesionalId: legajo,
            fecha: fechaADate(fecha),
            horarioInicio: dto.horarioInicio,
            horarioFin: dto.horarioFin,
          },
        }),
      ),
    );
    return creados.map((h) => this.formatearHorario(h));
  }

  // Logical delete (ARQ-01). Not allowed while a turno is booked inside those hours.
  async deactivateDisponibilidad(
    legajo: number,
    id: number,
    actor: PublicUser,
  ): Promise<void> {
    this.assertPuedeGestionar(legajo, actor);
    const horario = await this.prisma.disponibilidadHoraria.findFirst({
      where: { id, profesionalId: legajo, fechaBaja: null },
    });
    if (!horario) {
      throw new NotFoundException('Horario no encontrado');
    }
    const fecha = dateAFecha(horario.fecha);
    this.assertNoPaso(fecha);

    const turnos = await tramosOcupados(this.prisma, [legajo], fecha);
    const inicio = aMinutos(horario.horarioInicio);
    const fin = aMinutos(horario.horarioFin);
    if (turnos.some((t) => seSuperponen(inicio, fin, t.inicio, t.fin))) {
      throw new ConflictException(
        'Hay turnos reservados en ese horario: cancelalos o reprogramalos antes de quitarlo',
      );
    }

    await this.prisma.disponibilidadHoraria.update({
      where: { id },
      data: { fechaBaja: new Date() },
    });
  }

  // Logical delete of every working range of a date. Returns how many were removed.
  async deactivateDisponibilidadDeFecha(
    legajo: number,
    fecha: string,
    actor: PublicUser,
  ): Promise<number> {
    this.assertPuedeGestionar(legajo, actor);
    if (!esFechaValida(fecha)) {
      throw new BadRequestException('La fecha no es válida');
    }
    this.assertNoPaso(fecha);

    const turnos = await tramosOcupados(this.prisma, [legajo], fecha);
    if (turnos.length > 0) {
      throw new ConflictException(
        `Hay turnos reservados el ${fechaCorta(fecha)}: cancelalos o reprogramalos antes de quitar los horarios`,
      );
    }

    const result = await this.prisma.disponibilidadHoraria.updateMany({
      where: {
        profesionalId: legajo,
        fecha: fechaADate(fecha),
        fechaBaja: null,
      },
      data: { fechaBaja: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException(
        `No hay horarios cargados el ${fechaCorta(fecha)}`,
      );
    }
    return result.count;
  }

  // Upcoming and current blocks (the ones that haven't ended yet).
  findBloqueos(legajo: number): Promise<BloqueoAgenda[]> {
    return this.prisma.bloqueoAgenda.findMany({
      where: {
        profesionalId: legajo,
        fechaBaja: null,
        fechaFin: { gt: this.ahoraComoFechaHora() },
      },
      orderBy: { fechaInicio: 'asc' },
    });
  }

  async createBloqueo(
    legajo: number,
    dto: CreateBloqueoDto,
    actor: PublicUser,
  ): Promise<BloqueoAgenda> {
    this.assertPuedeGestionar(legajo, actor);
    await this.assertActivo(legajo);
    if (dto.fechaInicio >= dto.fechaFin) {
      throw new BadRequestException(
        'La fecha de inicio tiene que ser anterior a la de fin',
      );
    }
    const inicio = fechaHoraADate(dto.fechaInicio);
    const fin = fechaHoraADate(dto.fechaFin);

    // Turnos already taken in that period have to be cancelled or moved first.
    const turnos = await this.prisma.turno.findMany({
      where: {
        estado: { in: ESTADOS_OCUPAN },
        fecha: {
          gte: fechaADate(dto.fechaInicio.slice(0, 10)),
          lte: fechaADate(dto.fechaFin.slice(0, 10)),
        },
        detalles: { some: { profesionalId: legajo } },
      },
      include: {
        detalles: { orderBy: { id: 'asc' }, include: { servicio: true } },
      },
    });
    const choca = turnos.some((turno) => {
      let minuto = aMinutos(turno.horaInicio);
      return turno.detalles.some((detalle) => {
        const desde = new Date(turno.fecha.getTime() + minuto * 60000);
        minuto += detalle.servicio.tiempoDuracion;
        const hasta = new Date(turno.fecha.getTime() + minuto * 60000);
        return (
          detalle.profesionalId === legajo && desde < fin && inicio < hasta
        );
      });
    });
    if (choca) {
      throw new ConflictException(
        'Hay turnos reservados en ese período: cancelalos o reprogramalos antes de bloquear la agenda',
      );
    }

    return this.prisma.bloqueoAgenda.create({
      data: {
        profesionalId: legajo,
        fechaInicio: inicio,
        fechaFin: fin,
        motivo: dto.motivo || null,
      },
    });
  }

  // Logical delete (ARQ-01).
  async deactivateBloqueo(
    legajo: number,
    id: number,
    actor: PublicUser,
  ): Promise<void> {
    this.assertPuedeGestionar(legajo, actor);
    const result = await this.prisma.bloqueoAgenda.updateMany({
      where: { id, profesionalId: legajo, fechaBaja: null },
      data: { fechaBaja: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Bloqueo no encontrado');
    }
  }

  // A real date, not in the past and within the booking window.
  private validarFechaDeCarga(fecha: string): void {
    if (!esFechaValida(fecha)) {
      throw new BadRequestException(`La fecha ${fecha} no es válida`);
    }
    this.assertNoPaso(fecha);
    const limite = fechaADate(ahoraEnSalon().fecha);
    limite.setUTCDate(limite.getUTCDate() + MAX_DIAS_ANTICIPACION);
    if (fecha > dateAFecha(limite)) {
      throw new BadRequestException(
        `Solo se pueden cargar horarios hasta ${MAX_DIAS_ANTICIPACION} días adelante (${fechaCorta(fecha)})`,
      );
    }
  }

  private assertNoPaso(fecha: string): void {
    if (fecha < ahoraEnSalon().fecha) {
      throw new BadRequestException(`El ${fechaCorta(fecha)} ya pasó`);
    }
  }

  private formatearHorario(horario: DisponibilidadHoraria): HorarioDeTrabajo {
    return {
      id: horario.id,
      fecha: dateAFecha(horario.fecha),
      horarioInicio: horario.horarioInicio,
      horarioFin: horario.horarioFin,
    };
  }

  // Now as a local wall-clock Date, the format blocks are stored in.
  private ahoraComoFechaHora(): Date {
    const { fecha, minutos } = ahoraEnSalon();
    return new Date(fechaADate(fecha).getTime() + minutos * 60000);
  }

  // ADMIN manages any schedule; a PROFESIONAL only their own.
  private assertPuedeGestionar(legajo: number, actor: PublicUser): void {
    const esPropia =
      actor.rol === Rol.PROFESIONAL && actor.profesional?.legajo === legajo;
    if (actor.rol !== Rol.ADMIN && !esPropia) {
      throw new ForbiddenException('Solo podés gestionar tu propia agenda');
    }
  }
}
