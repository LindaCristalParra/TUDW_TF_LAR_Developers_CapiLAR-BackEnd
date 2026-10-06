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
} from '../generated/prisma/client';
import {
  aMinutos,
  ahoraEnSalon,
  fechaADate,
  fechaHoraADate,
  seSuperponen,
} from '../common/fecha-hora';
import { MAX_JORNADA } from '../common/reglas-agenda';
import { PrismaService } from '../prisma/prisma.service';
import { ESTADOS_OCUPAN } from '../turnos/agenda';
import { PublicUser } from '../users/users.service';
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';
import { CreateDisponibilidadDto } from './dto/create-disponibilidad.dto';

export interface ProfesionalResumen {
  legajo: number;
  nombre: string;
  apellido: string;
}

@Injectable()
export class ProfesionalesService {
  constructor(private readonly prisma: PrismaService) {}

  // Active professionals, for clients to choose who to book with.
  async findAll(): Promise<ProfesionalResumen[]> {
    const profesionales = await this.prisma.profesional.findMany({
      where: { usuario: { rol: Rol.PROFESIONAL, fechaBaja: null } },
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

  findDisponibilidad(legajo: number): Promise<DisponibilidadHoraria[]> {
    return this.prisma.disponibilidadHoraria.findMany({
      where: { profesionalId: legajo, fechaBaja: null },
      orderBy: [{ diaSemana: 'asc' }, { horarioInicio: 'asc' }],
    });
  }

  async createDisponibilidad(
    legajo: number,
    dto: CreateDisponibilidadDto,
    actor: PublicUser,
  ): Promise<DisponibilidadHoraria> {
    this.assertPuedeGestionar(legajo, actor);
    await this.assertActivo(legajo);

    const inicio = aMinutos(dto.horarioInicio);
    const fin = aMinutos(dto.horarioFin);
    if (inicio >= fin) {
      throw new BadRequestException(
        'El horario de inicio tiene que ser anterior al de fin',
      );
    }

    const delDia = await this.prisma.disponibilidadHoraria.findMany({
      where: {
        profesionalId: legajo,
        diaSemana: dto.diaSemana,
        fechaBaja: null,
      },
    });
    if (
      delDia.some((d) =>
        seSuperponen(
          inicio,
          fin,
          aMinutos(d.horarioInicio),
          aMinutos(d.horarioFin),
        ),
      )
    ) {
      throw new ConflictException(
        'Se superpone con otro horario cargado ese día',
      );
    }
    const jornada = delDia.reduce(
      (total, d) => total + aMinutos(d.horarioFin) - aMinutos(d.horarioInicio),
      fin - inicio,
    );
    if (jornada > MAX_JORNADA) {
      throw new BadRequestException(
        'La jornada de un día no puede superar las 12 horas',
      );
    }

    return this.prisma.disponibilidadHoraria.create({
      data: { profesionalId: legajo, ...dto },
    });
  }

  // Logical delete (ARQ-01).
  async deactivateDisponibilidad(
    legajo: number,
    id: number,
    actor: PublicUser,
  ): Promise<void> {
    this.assertPuedeGestionar(legajo, actor);
    const result = await this.prisma.disponibilidadHoraria.updateMany({
      where: { id, profesionalId: legajo, fechaBaja: null },
      data: { fechaBaja: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Horario no encontrado');
    }
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
