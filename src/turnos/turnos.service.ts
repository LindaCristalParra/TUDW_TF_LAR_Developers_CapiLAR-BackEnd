import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  EstadoEnvio,
  EstadoSerie,
  EstadoTurno,
  MedioNotificacion,
  Prisma,
  Rol,
  TipoNotificacion,
} from '../generated/prisma/client';
import {
  aHora,
  aMinutos,
  ahoraEnSalon,
  dateAFecha,
  esFechaValida,
  fechaADate,
} from '../common/fecha-hora';
import {
  MailService,
  MailTurno,
  TurnoAgendaDiaria,
} from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { fechasDeSerie } from '../series/fechas-serie';
import { PublicUser } from '../users/users.service';
import { VerificacionEmailService } from '../users/verificacion-email.service';
import {
  ESTADOS_CANCELABLES,
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
// The reminder goes out when the turno starts within this many hours (F06).
const HORAS_RECORDATORIO = 24;

// The reminder's link token is stored hashed, like the password reset token.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const turnoInclude = {
  detalles: {
    orderBy: { id: 'asc' },
    include: {
      servicio: { select: { tipo: true, tiempoDuracion: true } },
      profesional: {
        select: {
          legajo: true,
          usuario: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              email: true,
              rol: true,
              fechaBaja: true,
            },
          },
        },
      },
      // The active technical record of this service (at most one, see FichaTecnica).
      fichas: { where: { fechaBaja: null }, select: { id: true }, take: 1 },
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
          emailVerificadoEn: true,
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
    private readonly verificacionEmail: VerificacionEmailService,
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

  // CLIENTE: for themselves, PENDIENTE only if a service requires evaluation (else CONFIRMADO).
  // With serieId, a date of her series: always CONFIRMADO (the professional set it up).
  // PROFESIONAL: booking for a client, always CONFIRMADO.
  async create(dto: CreateTurnoDto, actor: PublicUser) {
    const esCliente = actor.rol === Rol.CLIENTE;
    const clienteId = esCliente ? actor.id : dto.clienteId;
    if (!clienteId) {
      throw new BadRequestException(
        'Indicá el cliente (clienteId) para cargar el turno',
      );
    }
    if (dto.serieId && !esCliente) {
      throw new ForbiddenException(
        'Solo la clienta reserva un turno de su serie',
      );
    }
    // F06: a client books by herself only with a verified email. The salon can book for her anyway.
    if (esCliente && !actor.emailVerificadoEn) {
      throw new ForbiddenException(
        `Para reservar tenés que verificar tu email. Abrí el enlace que te mandamos a ${actor.email} o pedí uno nuevo desde tu perfil.`,
      );
    }
    if (!esCliente) {
      await this.assertClienteActivo(clienteId);
    }

    const turno = await this.enTransaccion(async (tx) => {
      if (dto.serieId) {
        await this.assertFechaDeSerie(tx, dto, clienteId);
      }
      const ctx = await cargarContexto(tx, dto.fecha, dto.items, {
        clienteId,
        reservaElCliente: esCliente,
      });
      assertDisponible(ctx, dto.horaInicio);
      // One turno is one state: any service that requires evaluation keeps it all PENDIENTE.
      const requiereEvaluacion = ctx.items.some((i) => i.requiereEvaluacion);
      return tx.turno.create({
        data: {
          clienteId,
          fecha: fechaADate(dto.fecha),
          horaInicio: dto.horaInicio,
          horaFin: aHora(aMinutos(dto.horaInicio) + ctx.duracionTotal),
          metodoPago: dto.metodoPago,
          estado:
            esCliente && requiereEvaluacion && !dto.serieId
              ? EstadoTurno.PENDIENTE
              : EstadoTurno.CONFIRMADO,
          serieId: dto.serieId,
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

    if (turno.estado === EstadoTurno.PENDIENTE) {
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
      // Booked by the client and confirmed on the spot: the professionals learn it by mail.
      if (esCliente) {
        for (const profesional of this.profesionalesDe(turno)) {
          this.enviar(profesional.email, 'Tenés un turno nuevo', {
            ...this.contenidoBase(turno),
            titulo: 'Tenés un turno nuevo',
            nombre: profesional.nombre,
            mensaje: `${turno.cliente.usuario.nombre} ${turno.cliente.usuario.apellido} reservó un turno y ya quedó confirmado en tu agenda.`,
            boton: 'VER MI AGENDA',
            ruta: '/agenda',
          });
        }
      }
    }
    // Booked by the salon for an unverified client: once per booking, she's asked to verify.
    const { usuario } = turno.cliente;
    if (!esCliente && !usuario.emailVerificadoEn) {
      void this.verificacionEmail.enviar(
        usuario,
        'El salón te cargó un turno en CapiLAR. Verificá tu email con este botón para poder reservar vos misma desde la app.',
      );
    }
    return this.formatear(turno, { paraCliente: esCliente });
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
          // The client confirmed the old time, not the new one.
          asistenciaConfirmadaEn: null,
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
    const turno = await this.findDelCliente(id, actor.id);
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
    const motivo = dto.motivo || null;
    if (actor.rol === Rol.CLIENTE) {
      const turno = await this.findDelCliente(id, actor.id);
      return this.cancelarComoCliente(turno, motivo);
    }

    const turno = await this.findParaGestionar(id, actor);
    this.assertCancelable(turno);
    if (!motivo) {
      throw new BadRequestException('Contanos el motivo de la cancelación');
    }
    const actualizado = await this.prisma.turno.update({
      where: { id },
      data: { estado: EstadoTurno.CANCELADO, motivo },
      include: turnoInclude,
    });
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
    return this.formatear(actualizado);
  }

  // Same rules from the app and from the reminder's link. The professionals get an email.
  private async cancelarComoCliente(
    turno: TurnoCompleto,
    motivo: string | null,
  ) {
    this.assertCancelable(turno);
    const faltan = this.minutosHasta(turno, turno.horaInicio);
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

    const actualizado = await this.prisma.turno.update({
      where: { id: turno.id },
      data: { estado: EstadoTurno.CANCELADO, motivo },
      include: turnoInclude,
    });
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
    return this.formatear(actualizado, { paraCliente: true });
  }

  private assertCancelable(turno: TurnoCompleto): void {
    if (!ESTADOS_CANCELABLES.includes(turno.estado)) {
      throw new BadRequestException(
        'Solo se pueden cancelar turnos pendientes, confirmados o reprogramados',
      );
    }
  }

  async completar(id: number, actor: PublicUser) {
    const turno = await this.findParaGestionar(id, actor);
    if (turno.estado !== EstadoTurno.CONFIRMADO) {
      throw new BadRequestException(
        'Solo se pueden completar turnos confirmados',
      );
    }
    if (this.minutosHasta(turno, turno.horaInicio) > 0) {
      throw new BadRequestException(
        'El turno todavía no empezó: se completa desde su hora de inicio',
      );
    }
    // The technical records of the turno are locked together with it (immutable history, FIC-01).
    const [actualizado] = await this.prisma.$transaction([
      this.prisma.turno.update({
        where: { id },
        data: { estado: EstadoTurno.COMPLETADO },
        include: turnoInclude,
      }),
      this.prisma.fichaTecnica.updateMany({
        where: { turnoDetalle: { turnoId: id }, cerradaEn: null },
        data: { cerradaEn: new Date() },
      }),
    ]);
    return this.formatear(actualizado);
  }

  // CLIENTE: "I'll be there", for a CONFIRMADO turno that hasn't started. Confirming twice keeps the first date.
  async confirmarAsistencia(id: number, actor: PublicUser) {
    return this.confirmarAsistenciaDe(await this.findDelCliente(id, actor.id));
  }

  // From the app and from the reminder's link.
  private async confirmarAsistenciaDe(turno: TurnoCompleto) {
    if (turno.estado !== EstadoTurno.CONFIRMADO) {
      throw new BadRequestException(
        'Solo se puede confirmar la asistencia a turnos confirmados',
      );
    }
    if (this.minutosHasta(turno, turno.horaInicio) <= 0) {
      throw new BadRequestException('El turno ya empezó');
    }
    if (turno.asistenciaConfirmadaEn) {
      return this.formatear(turno, { paraCliente: true });
    }
    const actualizado = await this.prisma.turno.update({
      where: { id: turno.id },
      data: { asistenciaConfirmadaEn: new Date() },
      include: turnoInclude,
    });
    return this.formatear(actualizado, { paraCliente: true });
  }

  // --- F06 reminder (the cron calls it every 15 minutes) ---

  /**
   * Emails CONFIRMADO turnos that start within 24 h (but more than 12 h from now, so the
   * client can still cancel) and have no reminder for their current time. Returns how many
   * were sent. A failed email is saved as ERROR and retried on the next run.
   */
  async enviarRecordatorios(): Promise<number> {
    const hoy = fechaADate(ahoraEnSalon().fecha);
    const hasta = new Date(
      hoy.getTime() + Math.ceil(HORAS_RECORDATORIO / 24) * 86_400_000,
    );
    const turnos = await this.prisma.turno.findMany({
      where: {
        estado: EstadoTurno.CONFIRMADO,
        fecha: { gte: hoy, lte: hasta },
      },
      include: {
        ...turnoInclude,
        notificaciones: {
          where: {
            tipo: TipoNotificacion.RECORDATORIO,
            medio: MedioNotificacion.EMAIL,
            estadoEnvio: EstadoEnvio.ENVIADO,
          },
        },
      },
    });

    let enviados = 0;
    for (const turno of turnos) {
      const faltan = this.minutosHasta(turno, turno.horaInicio);
      const inicio = this.inicioDe(turno);
      if (
        faltan <= HORAS_CANCELACION_CLIENTE * 60 ||
        faltan > HORAS_RECORDATORIO * 60 ||
        turno.notificaciones.some(
          (n) => n.inicioTurno?.getTime() === inicio.getTime(),
        )
      ) {
        continue;
      }

      const token = randomBytes(32).toString('hex');
      const { usuario } = turno.cliente;
      let estadoEnvio: EstadoEnvio = EstadoEnvio.ENVIADO;
      try {
        await this.mailService.sendTurno(
          usuario.email,
          'Recordatorio de tu turno',
          {
            ...this.contenidoBase(turno),
            titulo: '¿Nos vemos en tu turno?',
            nombre: usuario.nombre,
            mensaje: `Te recordamos tu turno. Confirmanos si venís. Si no podés, cancelalo hasta ${HORAS_CANCELACION_CLIENTE} horas antes así otra persona puede usar el horario.`,
            boton: 'CONFIRMO QUE VOY',
            ruta: `/turno/confirmar?token=${token}`,
            botonSecundario: 'NO PUEDO IR',
            rutaSecundaria: `/turno/cancelar?token=${token}`,
          },
        );
        enviados++;
      } catch (error) {
        estadoEnvio = EstadoEnvio.ERROR;
        this.logger.error(
          `Could not send reminder of turno ${turno.id} to ${usuario.email}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      await this.prisma.notificacion.create({
        data: {
          turnoId: turno.id,
          usuarioId: usuario.id,
          medio: MedioNotificacion.EMAIL,
          tipo: TipoNotificacion.RECORDATORIO,
          estadoEnvio,
          inicioTurno: inicio,
          tokenHash:
            estadoEnvio === EstadoEnvio.ENVIADO ? hashToken(token) : null,
        },
      });
    }
    return enviados;
  }

  // Public routes with the reminder's link token (no login).

  async verPorToken(token: string) {
    const turno = await this.turnoDelToken(token);
    return {
      ...this.formatear(turno, { paraCliente: true }),
      puedeCancelar:
        this.minutosHasta(turno, turno.horaInicio) >=
        HORAS_CANCELACION_CLIENTE * 60,
    };
  }

  async confirmarPorToken(token: string) {
    return this.confirmarAsistenciaDe(await this.turnoDelToken(token));
  }

  async cancelarPorToken(token: string, motivo: string | null) {
    return this.cancelarComoCliente(await this.turnoDelToken(token), motivo);
  }

  // Valid while the turno is still CONFIRMADO, at the same time, and hasn't started.
  private async turnoDelToken(token: string): Promise<TurnoCompleto> {
    const notificacion = await this.prisma.notificacion.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { turno: { include: turnoInclude } },
    });
    const turno = notificacion?.turno;
    if (
      !turno ||
      notificacion.tipo !== TipoNotificacion.RECORDATORIO ||
      notificacion.inicioTurno?.getTime() !== this.inicioDe(turno).getTime()
    ) {
      throw new BadRequestException(
        'El enlace no es válido o el turno cambió de horario. Revisá tus turnos en la app.',
      );
    }
    if (turno.estado !== EstadoTurno.CONFIRMADO) {
      throw new BadRequestException(
        'Este turno ya no está confirmado. Revisá tus turnos en la app.',
      );
    }
    if (this.minutosHasta(turno, turno.horaInicio) <= 0) {
      throw new BadRequestException('El turno ya empezó');
    }
    return turno;
  }

  /** Start of the turno as a local wall-clock Date (date at 00:00 UTC + minutes). */
  private inicioDe(turno: { fecha: Date; horaInicio: string }): Date {
    return new Date(
      turno.fecha.getTime() + aMinutos(turno.horaInicio) * 60_000,
    );
  }

  // --- F07 daily agenda (the cron calls it at 21:00) ---

  /**
   * Emails each active professional their turnos of `fecha` (tomorrow by default): CONFIRMADO
   * split by attendance confirmed or not, and PENDIENTE requests apart. Only their own services
   * of each turno. No turnos → no email. Whoever already got that date's agenda is skipped.
   * Returns how many emails were sent.
   */
  async enviarAgendasDiarias(fecha = this.manana()): Promise<number> {
    const dia = fechaADate(fecha);
    const turnos = await this.prisma.turno.findMany({
      where: {
        fecha: dia,
        estado: { in: [EstadoTurno.CONFIRMADO, EstadoTurno.PENDIENTE] },
      },
      include: turnoInclude,
    });

    type Profesional =
      TurnoCompleto['detalles'][number]['profesional']['usuario'];
    const agendas = new Map<
      number,
      {
        usuario: Profesional;
        confirmados: TurnoAgendaDiaria[];
        sinConfirmar: TurnoAgendaDiaria[];
        pendientes: TurnoAgendaDiaria[];
      }
    >();
    for (const turno of turnos) {
      const { detalles, cliente } = this.formatear(turno);
      // Once per professional, even if they do several services of the turno.
      const unoPorProfesional = new Map(
        turno.detalles.map((d) => [d.profesionalId, d]),
      );
      for (const d of unoPorProfesional.values()) {
        const { usuario } = d.profesional;
        if (usuario.rol !== Rol.PROFESIONAL || usuario.fechaBaja !== null) {
          continue;
        }
        const agenda = agendas.get(usuario.id) ?? {
          usuario,
          confirmados: [],
          sinConfirmar: [],
          pendientes: [],
        };
        agendas.set(usuario.id, agenda);
        const suyos = detalles.filter((x) => x.legajo === d.profesionalId);
        const fila: TurnoAgendaDiaria = {
          horario: `${suyos[0].horaInicio}–${suyos[suyos.length - 1].horaFin}`,
          cliente: `${cliente.nombre} ${cliente.apellido}`,
          telefono: cliente.telefono,
          servicios: suyos.map((x) => x.servicio).join(', '),
          alergia: cliente.alergia ?? '',
        };
        const grupo =
          turno.estado === EstadoTurno.PENDIENTE
            ? agenda.pendientes
            : turno.asistenciaConfirmadaEn
              ? agenda.confirmados
              : agenda.sinConfirmar;
        grupo.push(fila);
      }
    }

    // inicioTurno holds the agenda's date for AGENDA_DIARIA.
    const yaRecibieron = new Set(
      (
        await this.prisma.notificacion.findMany({
          where: {
            tipo: TipoNotificacion.AGENDA_DIARIA,
            estadoEnvio: EstadoEnvio.ENVIADO,
            inicioTurno: dia,
          },
          select: { usuarioId: true },
        })
      ).map((n) => n.usuarioId),
    );

    const porHora = (a: TurnoAgendaDiaria, b: TurnoAgendaDiaria) =>
      a.horario.localeCompare(b.horario);
    let enviados = 0;
    for (const {
      usuario,
      confirmados,
      sinConfirmar,
      pendientes,
    } of agendas.values()) {
      if (yaRecibieron.has(usuario.id)) {
        continue;
      }
      const grupos = [
        {
          titulo: 'Asistencia confirmada',
          color: '#2E7D32',
          turnos: confirmados,
        },
        {
          titulo: 'Sin confirmar asistencia',
          color: '#F98D56',
          turnos: sinConfirmar,
        },
        {
          titulo: 'Solicitudes para aceptar',
          color: '#737373',
          turnos: pendientes,
        },
      ]
        .filter((g) => g.turnos.length > 0)
        .map((g) => ({ ...g, turnos: [...g.turnos].sort(porHora) }));

      let estadoEnvio: EstadoEnvio = EstadoEnvio.ENVIADO;
      try {
        await this.mailService.sendAgendaDiaria(usuario.email, {
          nombre: usuario.nombre,
          fecha: this.fechaLarga(fecha),
          grupos,
        });
        enviados++;
      } catch (error) {
        estadoEnvio = EstadoEnvio.ERROR;
        this.logger.error(
          `Could not send the daily agenda to ${usuario.email}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      await this.prisma.notificacion.create({
        data: {
          usuarioId: usuario.id,
          medio: MedioNotificacion.EMAIL,
          tipo: TipoNotificacion.AGENDA_DIARIA,
          estadoEnvio,
          inicioTurno: dia,
        },
      });
    }
    return enviados;
  }

  /** Tomorrow's date in the salon, "YYYY-MM-DD". */
  private manana(): string {
    const hoy = fechaADate(ahoraEnSalon().fecha);
    return dateAFecha(new Date(hoy.getTime() + 86_400_000));
  }

  // The client didn't come: CONFIRMADO → AUSENTE, once the turno is over. No email.
  async marcarAusente(id: number, actor: PublicUser) {
    const turno = await this.findParaGestionar(id, actor);
    if (turno.estado !== EstadoTurno.CONFIRMADO) {
      throw new BadRequestException(
        'Solo se pueden marcar como ausentes turnos confirmados',
      );
    }
    if (this.minutosHasta(turno, turno.horaFin) > 0) {
      throw new BadRequestException(
        'El turno todavía no terminó: se marca como ausente desde su hora de fin',
      );
    }
    const actualizado = await this.prisma.turno.update({
      where: { id },
      data: { estado: EstadoTurno.AUSENTE },
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
    clienteId: number,
  ): Promise<TurnoCompleto> {
    const turno = await this.prisma.turno.findUnique({
      where: { id },
      include: turnoInclude,
    });
    if (!turno || turno.clienteId !== clienteId) {
      throw new NotFoundException('Turno no encontrado');
    }
    return turno;
  }

  /** Minutes from now (salon time) until `hora` of the turno's date; negative if it already passed. */
  private minutosHasta(turno: TurnoCompleto, hora: string): number {
    const ahora = ahoraEnSalon();
    const dias =
      (turno.fecha.getTime() - fechaADate(ahora.fecha).getTime()) / 86_400_000;
    return dias * 1440 + aMinutos(hora) - ahora.minutos;
  }

  // F05: a date of her ACTIVA series that has no turno of the series (it was taken when the
  // series was set up), with the series' service and professional. Inside the booking transaction.
  private async assertFechaDeSerie(
    tx: Prisma.TransactionClient,
    dto: CreateTurnoDto,
    clienteId: number,
  ): Promise<void> {
    const serie = await tx.serieTurno.findUnique({
      where: { id: dto.serieId },
      include: { turnos: { select: { fecha: true } } },
    });
    if (!serie || serie.clienteId !== clienteId) {
      throw new NotFoundException('Serie no encontrada');
    }
    if (serie.estado !== EstadoSerie.ACTIVA) {
      throw new BadRequestException('La serie no está activa');
    }
    if (!fechasDeSerie(serie).includes(dto.fecha)) {
      throw new BadRequestException('Esa fecha no es parte de la serie');
    }
    // A date she canceled herself also keeps its turno: it is not offered again.
    if (serie.turnos.some((t) => dateAFecha(t.fecha) === dto.fecha)) {
      throw new ConflictException('Esa fecha de la serie ya tiene turno');
    }
    const [item] = dto.items;
    if (
      dto.items.length !== 1 ||
      item.servicioId !== serie.servicioId ||
      item.legajo !== serie.profesionalId
    ) {
      throw new BadRequestException(
        'Para tu serie reservá el mismo servicio con el mismo profesional',
      );
    }
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
        // Salon only: the client sees her records in GET /fichas/mias.
        ...(opciones.paraCliente ? {} : { fichaId: d.fichas[0]?.id ?? null }),
      };
    });
    const { usuario, alergia } = turno.cliente;
    return {
      id: turno.id,
      fecha: dateAFecha(turno.fecha),
      horaInicio: turno.horaInicio,
      horaFin: turno.horaFin,
      estado: turno.estado,
      asistenciaConfirmadaEn: turno.asistenciaConfirmadaEn,
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
        // null = email not verified yet (the agenda shows it).
        emailVerificadoEn: usuario.emailVerificadoEn,
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
      botonSecundario: '',
      rutaSecundaria: '',
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
