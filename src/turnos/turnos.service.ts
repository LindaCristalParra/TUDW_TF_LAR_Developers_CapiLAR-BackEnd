import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EstadoTurno, Prisma, Rol } from '../generated/prisma/client';
import {
  aHora,
  aMinutos,
  ahoraEnSalon,
  dateAFecha,
  esFechaValida,
  fechaADate,
} from '../common/fecha-hora';
import { MailService, MailTurno } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser } from '../users/users.service';
import {
  ItemTurno,
  assertDisponible,
  cargarContexto,
  horariosLibres,
} from './agenda';
import { AgendaQueryDto } from './dto/agenda-query.dto';
import { CancelarTurnoDto } from './dto/cancelar-turno.dto';
import { CreateTurnoDto } from './dto/create-turno.dto';
import { HorariosLibresDto } from './dto/horarios-libres.dto';
import { RechazarTurnoDto } from './dto/rechazar-turno.dto';
import { ReprogramarTurnoDto } from './dto/reprogramar-turno.dto';

const MAX_DIAS_AGENDA = 31;
// A client can cancel a CONFIRMADO turno up to this many hours before it starts.
const HORAS_CANCELACION_CLIENTE = 12;

// States a turno can still be canceled from.
const ESTADOS_CANCELABLES: EstadoTurno[] = [
  EstadoTurno.PENDIENTE,
  EstadoTurno.CONFIRMADO,
  EstadoTurno.REPROGRAMADO,
];

const turnoInclude = {
  detalles: {
    orderBy: { id: 'asc' },
    include: {
      servicio: { select: { tipo: true, tiempoDuracion: true } },
      profesional: {
        select: {
          legajo: true,
          usuario: { select: { nombre: true, apellido: true, email: true } },
        },
      },
    },
  },
  cliente: {
    select: {
      alergia: true,
      usuario: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          telefono: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.TurnoInclude;

type TurnoCompleto = Prisma.TurnoGetPayload<{ include: typeof turnoInclude }>;

// Serializable, so two people can't book the same slot at the same time.
const TX_SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

@Injectable()
export class TurnosService {
  private readonly logger = new Logger(TurnosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // turnoId (rescheduling) and clienteId (booking for a client) are for professionals only.
  async horariosLibres(dto: HorariosLibresDto, actor: PublicUser) {
    const esCliente = actor.rol === Rol.CLIENTE;
    if (actor.rol !== Rol.PROFESIONAL && (dto.turnoId || dto.clienteId)) {
      throw new ForbiddenException(
        'Solo un profesional puede consultar horarios para otro turno o cliente',
      );
    }
    if (dto.turnoId && dto.clienteId) {
      throw new BadRequestException(
        'Mandá el turno (turnoId) o el cliente (clienteId), no los dos',
      );
    }

    let clienteId = esCliente ? actor.id : dto.clienteId;
    if (dto.turnoId) {
      const turno = await this.findParaGestionar(dto.turnoId, actor);
      clienteId = turno.clienteId;
    } else if (dto.clienteId) {
      await this.assertClienteActivo(dto.clienteId);
    }

    const ctx = await cargarContexto(this.prisma, dto.fecha, dto.items, {
      excluirTurnoId: dto.turnoId,
      clienteId,
      reservaElCliente: esCliente,
    });
    return {
      fecha: dto.fecha,
      duracion: ctx.duracionTotal,
      horarios: horariosLibres(ctx),
    };
  }

  // CLIENTE: request for themselves (PENDIENTE). PROFESIONAL: booking for a client (CONFIRMADO).
  async create(dto: CreateTurnoDto, actor: PublicUser) {
    const esCliente = actor.rol === Rol.CLIENTE;
    const clienteId = esCliente ? actor.id : dto.clienteId;
    if (!clienteId) {
      throw new BadRequestException(
        'Indicá el cliente (clienteId) para cargar el turno',
      );
    }
    if (!esCliente) {
      await this.assertClienteActivo(clienteId);
    }

    const turno = await this.enTransaccion(async (tx) => {
      const ctx = await cargarContexto(tx, dto.fecha, dto.items, {
        clienteId,
        reservaElCliente: esCliente,
      });
      assertDisponible(ctx, dto.horaInicio);
      return tx.turno.create({
        data: {
          clienteId,
          fecha: fechaADate(dto.fecha),
          horaInicio: dto.horaInicio,
          horaFin: aHora(aMinutos(dto.horaInicio) + ctx.duracionTotal),
          metodoPago: dto.metodoPago,
          estado: esCliente ? EstadoTurno.PENDIENTE : EstadoTurno.CONFIRMADO,
          detalles: {
            create: ctx.items.map((item) => ({
              servicioId: item.servicioId,
              profesionalId: item.legajo,
              precioBase: item.precio,
            })),
          },
        },
        include: turnoInclude,
      });
    });

    if (esCliente) {
      this.avisarCliente(turno, 'Recibimos tu solicitud de turno', {
        titulo: 'Recibimos tu solicitud',
        mensaje:
          'Tu pedido de turno ya está en manos del salón. Te avisamos por mail apenas lo confirmen.',
        boton: 'VER MIS TURNOS',
      });
      for (const profesional of this.profesionalesDe(turno)) {
        this.enviar(profesional.email, 'Nueva solicitud de turno', {
          ...this.contenidoBase(turno),
          titulo: 'Tenés una nueva solicitud',
          nombre: profesional.nombre,
          mensaje: `${turno.cliente.usuario.nombre} ${turno.cliente.usuario.apellido} pidió un turno. Entrá a tu agenda para aceptarlo o proponerle otro horario.`,
          boton: 'VER MI AGENDA',
          ruta: '/agenda',
        });
      }
    } else {
      this.avisarConfirmado(turno);
    }
    return this.formatear(turno);
  }

  async findMios(actor: PublicUser) {
    const turnos = await this.prisma.turno.findMany({
      where: { clienteId: actor.id },
      orderBy: [{ fecha: 'desc' }, { horaInicio: 'desc' }],
      include: turnoInclude,
    });
    return turnos.map((t) => this.formatear(t, { paraCliente: true }));
  }

  // Read-only for the whole salon: one professional with legajo, everyone without it.
  async agenda(query: AgendaQueryDto) {
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
    if (dias >= MAX_DIAS_AGENDA) {
      throw new BadRequestException(
        `La agenda se consulta de a ${MAX_DIAS_AGENDA} días como máximo`,
      );
    }

    const legajo = query.legajo;
    const turnos = await this.prisma.turno.findMany({
      where: {
        fecha: { gte: fechaADate(query.desde), lte: fechaADate(query.hasta) },
        detalles: legajo ? { some: { profesionalId: legajo } } : undefined,
      },
      orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
      include: turnoInclude,
    });
    return turnos.map((t) => this.formatear(t));
  }

  async aceptar(id: number, actor: PublicUser) {
    const turno = await this.findParaGestionar(id, actor);
    if (turno.estado !== EstadoTurno.PENDIENTE) {
      throw new BadRequestException(
        'Solo se pueden aceptar solicitudes pendientes',
      );
    }
    const actualizado = await this.prisma.turno.update({
      where: { id },
      data: { estado: EstadoTurno.CONFIRMADO },
      include: turnoInclude,
    });
    this.avisarConfirmado(actualizado);
    return this.formatear(actualizado);
  }

  async rechazar(id: number, dto: RechazarTurnoDto, actor: PublicUser) {
    const turno = await this.findParaGestionar(id, actor);
    if (turno.estado !== EstadoTurno.PENDIENTE) {
      throw new BadRequestException(
        'Solo se pueden rechazar solicitudes pendientes',
      );
    }

    // Offered alternatives must really be free (this turno's slot no longer counts).
    const items = this.itemsDe(turno);
    const alternativas: string[] = [];
    for (const alt of dto.alternativas ?? []) {
      const ctx = await cargarContexto(this.prisma, alt.fecha, items, {
        excluirTurnoId: id,
        clienteId: turno.clienteId,
      });
      try {
        assertDisponible(ctx, alt.horaInicio);
      } catch (error) {
        const motivo = error instanceof Error ? error.message : '';
        throw new ConflictException(
          `La alternativa del ${alt.fecha} a las ${alt.horaInicio} no está disponible: ${motivo}`,
        );
      }
      alternativas.push(
        `${this.fechaLarga(alt.fecha)} a las ${alt.horaInicio}`,
      );
    }

    const actualizado = await this.prisma.turno.update({
      where: { id },
      data: { estado: EstadoTurno.RECHAZADO, motivo: dto.motivo },
      include: turnoInclude,
    });

    // Friendly notice without the internal reason.
    this.avisarCliente(actualizado, 'Sobre tu solicitud de turno', {
      titulo: 'Busquemos otro horario',
      mensaje: alternativas.length
        ? 'No pudimos confirmar tu turno en ese horario, pero queremos atenderte. Elegí el que mejor te quede de estos y pedilo desde la app.'
        : 'No pudimos confirmar tu turno en ese horario, pero queremos atenderte. Entrá a la app y elegí otro horario que te quede cómodo.',
      alternativas,
      boton: 'ELEGIR OTRO HORARIO',
    });
    return this.formatear(actualizado);
  }

  async reprogramar(id: number, dto: ReprogramarTurnoDto, actor: PublicUser) {
    const turno = await this.findParaGestionar(id, actor);
    const reprogramables: EstadoTurno[] = [
      EstadoTurno.PENDIENTE,
      EstadoTurno.CONFIRMADO,
      EstadoTurno.REPROGRAMADO,
    ];
    if (!reprogramables.includes(turno.estado)) {
      throw new BadRequestException(
        'Solo se pueden reprogramar turnos pendientes, confirmados o ya reprogramados',
      );
    }
    if (
      dto.profesionales &&
      dto.profesionales.length !== turno.detalles.length
    ) {
      throw new BadRequestException(
        `Mandá un legajo por cada servicio del turno (${turno.detalles.length})`,
      );
    }

    const items = this.itemsDe(turno).map((item, i) => ({
      ...item,
      legajo: dto.profesionales?.[i] ?? item.legajo,
    }));

    const actualizado = await this.enTransaccion(async (tx) => {
      const ctx = await cargarContexto(tx, dto.fecha, items, {
        excluirTurnoId: id,
        clienteId: turno.clienteId,
      });
      assertDisponible(ctx, dto.horaInicio);
      for (const [i, detalle] of turno.detalles.entries()) {
        if (detalle.profesionalId !== items[i].legajo) {
          await tx.turnoDetalle.update({
            where: { id: detalle.id },
            data: { profesionalId: items[i].legajo },
          });
        }
      }
      return tx.turno.update({
        where: { id },
        data: {
          fecha: fechaADate(dto.fecha),
          horaInicio: dto.horaInicio,
          horaFin: aHora(aMinutos(dto.horaInicio) + ctx.duracionTotal),
          estado: EstadoTurno.REPROGRAMADO,
        },
        include: turnoInclude,
      });
    });

    this.avisarCliente(actualizado, 'Te proponemos un nuevo horario', {
      titulo: 'Te proponemos un nuevo horario',
      mensaje:
        'El salón necesitó mover tu turno. Este es el horario nuevo: entrá a la app para aceptarlo. Si no te queda cómodo, podés cancelarlo y pedir otro.',
      boton: 'VER MI TURNO',
    });
    return this.formatear(actualizado);
  }

  async aceptarReprogramacion(id: number, actor: PublicUser) {
    const turno = await this.findDelCliente(id, actor);
    if (turno.estado !== EstadoTurno.REPROGRAMADO) {
      throw new BadRequestException(
        'Este turno no tiene un cambio de horario para aceptar',
      );
    }
    const actualizado = await this.prisma.turno.update({
      where: { id },
      data: { estado: EstadoTurno.CONFIRMADO },
      include: turnoInclude,
    });
    this.avisarConfirmado(actualizado);
    return this.formatear(actualizado, { paraCliente: true });
  }

  // CLIENTE: their own turno; CONFIRMADO only up to 12 h before. Salon: any time, with a reason.
  async cancelar(id: number, dto: CancelarTurnoDto, actor: PublicUser) {
    const esCliente = actor.rol === Rol.CLIENTE;
    const motivo = dto.motivo || null;
    const turno = esCliente
      ? await this.findDelCliente(id, actor)
      : await this.findParaGestionar(id, actor);
    if (!ESTADOS_CANCELABLES.includes(turno.estado)) {
      throw new BadRequestException(
        'Solo se pueden cancelar turnos pendientes, confirmados o reprogramados',
      );
    }

    if (esCliente) {
      const faltan = this.minutosHastaInicio(turno);
      if (faltan <= 0) {
        throw new BadRequestException(
          'El turno ya empezó: comunicate con el salón',
        );
      }
      if (
        turno.estado === EstadoTurno.CONFIRMADO &&
        faltan < HORAS_CANCELACION_CLIENTE * 60
      ) {
        throw new BadRequestException(
          `Los turnos confirmados se cancelan hasta ${HORAS_CANCELACION_CLIENTE} horas antes. Para cancelarlo ahora, comunicate con el salón.`,
        );
      }
    } else if (!motivo) {
      throw new BadRequestException('Contanos el motivo de la cancelación');
    }

    const actualizado = await this.prisma.turno.update({
      where: { id },
      data: { estado: EstadoTurno.CANCELADO, motivo },
      include: turnoInclude,
    });

    if (esCliente) {
      const { nombre, apellido } = actualizado.cliente.usuario;
      for (const profesional of this.profesionalesDe(actualizado)) {
        this.enviar(profesional.email, 'Se canceló un turno', {
          ...this.contenidoBase(actualizado),
          titulo: 'Se canceló un turno',
          nombre: profesional.nombre,
          mensaje: `${nombre} ${apellido} canceló su turno.${motivo ? ` Motivo: "${motivo}".` : ''} El horario ya quedó libre en tu agenda.`,
          boton: 'VER MI AGENDA',
          ruta: '/agenda',
        });
      }
    } else {
      this.avisarCliente(actualizado, 'Tu turno fue cancelado', {
        titulo: 'Tu turno fue cancelado',
        mensaje: `Lamentamos avisarte que el salón tuvo que cancelar tu turno. Motivo: "${motivo}". Entrá a la app y elegí otro horario que te quede cómodo.`,
        boton: 'PEDIR OTRO TURNO',
      });
      // The other professionals of the turno also lose that slot from their agenda.
      for (const profesional of this.profesionalesDe(actualizado)) {
        if (profesional.email === actor.email) continue;
        this.enviar(profesional.email, 'Se canceló un turno', {
          ...this.contenidoBase(actualizado),
          titulo: 'Se canceló un turno',
          nombre: profesional.nombre,
          mensaje: `El salón canceló este turno. Motivo: "${motivo}". El horario ya quedó libre en tu agenda.`,
          boton: 'VER MI AGENDA',
          ruta: '/agenda',
        });
      }
    }
    return this.formatear(actualizado, { paraCliente: esCliente });
  }

  async completar(id: number, actor: PublicUser) {
    const turno = await this.findParaGestionar(id, actor);
    if (turno.estado !== EstadoTurno.CONFIRMADO) {
      throw new BadRequestException(
        'Solo se pueden completar turnos confirmados',
      );
    }
    if (this.minutosHastaInicio(turno) > 0) {
      throw new BadRequestException(
        'El turno todavía no empezó: se completa desde su hora de inicio',
      );
    }
    const actualizado = await this.prisma.turno.update({
      where: { id },
      data: { estado: EstadoTurno.COMPLETADO },
      include: turnoInclude,
    });
    return this.formatear(actualizado);
  }

  // --- helpers ---

  private async enTransaccion<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, TX_SERIALIZABLE);
    } catch (error) {
      // P2034: write conflict or deadlock between two simultaneous bookings.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Alguien estaba reservando el mismo horario. Probá de nuevo.',
        );
      }
      throw error;
    }
  }

  // Only a PROFESIONAL that does at least one service of the turno.
  private async findParaGestionar(
    id: number,
    actor: PublicUser,
  ): Promise<TurnoCompleto> {
    const turno = await this.prisma.turno.findUnique({
      where: { id },
      include: turnoInclude,
    });
    if (!turno) {
      throw new NotFoundException('Turno no encontrado');
    }
    const participa =
      actor.rol === Rol.PROFESIONAL &&
      turno.detalles.some((d) => d.profesionalId === actor.profesional?.legajo);
    if (!participa) {
      throw new ForbiddenException('Solo podés gestionar turnos de tu agenda');
    }
    return turno;
  }

  // A CLIENTE only sees their own turnos (404 for the rest, so ids don't leak).
  private async findDelCliente(
    id: number,
    actor: PublicUser,
  ): Promise<TurnoCompleto> {
    const turno = await this.prisma.turno.findUnique({
      where: { id },
      include: turnoInclude,
    });
    if (!turno || turno.clienteId !== actor.id) {
      throw new NotFoundException('Turno no encontrado');
    }
    return turno;
  }

  /** Minutes from now (salon time) until the turno starts; negative if it already started. */
  private minutosHastaInicio(turno: TurnoCompleto): number {
    const ahora = ahoraEnSalon();
    const dias =
      (turno.fecha.getTime() - fechaADate(ahora.fecha).getTime()) / 86_400_000;
    return dias * 1440 + aMinutos(turno.horaInicio) - ahora.minutos;
  }

  private async assertClienteActivo(clienteId: number): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: clienteId },
      select: { rol: true, fechaBaja: true },
    });
    if (!usuario || usuario.rol !== Rol.CLIENTE || usuario.fechaBaja !== null) {
      throw new NotFoundException('Cliente no encontrado');
    }
  }

  private itemsDe(turno: TurnoCompleto): ItemTurno[] {
    return turno.detalles.map((d) => ({
      servicioId: d.servicioId,
      legajo: d.profesionalId,
    }));
  }

  private profesionalesDe(turno: TurnoCompleto) {
    const vistos = new Map<number, { nombre: string; email: string }>();
    for (const d of turno.detalles) {
      vistos.set(d.profesionalId, d.profesional.usuario);
    }
    return [...vistos.values()];
  }

  // Each service with its own time range (they are done one after another).
  private formatear(
    turno: TurnoCompleto,
    opciones: { paraCliente?: boolean } = {},
  ) {
    let minuto = aMinutos(turno.horaInicio);
    const detalles = turno.detalles.map((d) => {
      const inicio = minuto;
      minuto += d.servicio.tiempoDuracion;
      return {
        id: d.id,
        servicioId: d.servicioId,
        servicio: d.servicio.tipo,
        legajo: d.profesionalId,
        profesional: `${d.profesional.usuario.nombre} ${d.profesional.usuario.apellido}`,
        horaInicio: aHora(inicio),
        horaFin: aHora(minuto),
        precioBase: d.precioBase,
      };
    });
    const { usuario, alergia } = turno.cliente;
    return {
      id: turno.id,
      fecha: dateAFecha(turno.fecha),
      horaInicio: turno.horaInicio,
      horaFin: turno.horaFin,
      estado: turno.estado,
      metodoPago: turno.metodoPago,
      // A rejection reason is internal: never sent to the client. A cancellation reason is.
      ...(opciones.paraCliente && turno.estado === EstadoTurno.RECHAZADO
        ? {}
        : { motivo: turno.motivo }),
      cliente: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        telefono: usuario.telefono,
        alergia,
      },
      detalles,
    };
  }

  private contenidoBase(turno: TurnoCompleto) {
    const { detalles } = this.formatear(turno);
    return {
      fecha: this.fechaLarga(dateAFecha(turno.fecha)),
      horaInicio: turno.horaInicio,
      horaFin: turno.horaFin,
      servicios: detalles.map((d) => ({
        horario: `${d.horaInicio}–${d.horaFin}`,
        servicio: d.servicio,
        profesional: d.profesional,
      })),
      alternativas: [] as string[],
    };
  }

  private avisarConfirmado(turno: TurnoCompleto): void {
    this.avisarCliente(turno, 'Tu turno está confirmado', {
      titulo: '¡Tu turno está confirmado!',
      mensaje:
        'Te esperamos en el salón. Si necesitás cambiarlo, podés hacerlo desde la app.',
      boton: 'VER MI TURNO',
    });
  }

  private avisarCliente(
    turno: TurnoCompleto,
    asunto: string,
    texto: Pick<MailTurno, 'titulo' | 'mensaje' | 'boton'> &
      Partial<Pick<MailTurno, 'alternativas'>>,
  ): void {
    const { usuario } = turno.cliente;
    this.enviar(usuario.email, asunto, {
      ...this.contenidoBase(turno),
      nombre: usuario.nombre,
      ruta: '/mis-turnos',
      ...texto,
    });
  }

  // Not awaited: a slow or failed email must not delay or break the request.
  private enviar(email: string, asunto: string, contenido: MailTurno): void {
    this.mailService.sendTurno(email, asunto, contenido).catch((error) => {
      this.logger.error(
        `Could not send "${asunto}" to ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
    });
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
