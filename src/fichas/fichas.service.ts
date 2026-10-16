import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { dateAFecha } from '../common/fecha-hora';
import { EstadoTurno, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser } from '../users/users.service';
import { CreateFichaDto } from './dto/create-ficha.dto';
import { FichaDto } from './dto/ficha.dto';

const fichaInclude = {
  turnoDetalle: {
    include: {
      turno: {
        select: { id: true, fecha: true, horaInicio: true, clienteId: true },
      },
      servicio: { select: { tipo: true } },
      profesional: {
        select: {
          legajo: true,
          usuario: { select: { nombre: true, apellido: true } },
        },
      },
    },
  },
} satisfies Prisma.FichaTecnicaInclude;

type FichaCompleta = Prisma.FichaTecnicaGetPayload<{
  include: typeof fichaInclude;
}>;

@Injectable()
export class FichasService {
  constructor(private readonly prisma: PrismaService) {}

  // Only the professional of that service, while the turno is CONFIRMADO.
  async create(turnoId: number, dto: CreateFichaDto, actor: PublicUser) {
    const { turnoDetalleId, ...campos } = dto;
    const detalle = await this.prisma.turnoDetalle.findUnique({
      where: { id: turnoDetalleId },
      include: { turno: { select: { estado: true } } },
    });
    if (!detalle || detalle.turnoId !== turnoId) {
      throw new NotFoundException('Ese servicio no es de este turno');
    }
    this.assertEsSuyo(detalle.profesionalId, actor);
    if (detalle.turno.estado !== EstadoTurno.CONFIRMADO) {
      throw new BadRequestException(
        'Solo se cargan fichas de turnos confirmados',
      );
    }
    const existente = await this.prisma.fichaTecnica.findFirst({
      where: { turnoDetalleId, fechaBaja: null },
    });
    if (existente) {
      throw new ConflictException(
        `Ese servicio ya tiene ficha (${existente.id}): editala`,
      );
    }

    const ficha = await this.prisma.fichaTecnica.create({
      data: { turnoDetalleId, ...this.limpiar(campos) },
      include: fichaInclude,
    });
    return this.formatear(ficha);
  }

  async update(id: number, dto: FichaDto, actor: PublicUser) {
    const ficha = await this.findParaEditar(id, actor);
    const actualizada = await this.prisma.fichaTecnica.update({
      where: { id: ficha.id },
      data: this.limpiar(dto),
      include: fichaInclude,
    });
    return this.formatear(actualizada);
  }

  // Logical delete, only while it's open.
  async deactivate(id: number, actor: PublicUser): Promise<void> {
    const ficha = await this.findParaEditar(id, actor);
    await this.prisma.fichaTecnica.update({
      where: { id: ficha.id },
      data: { fechaBaja: new Date() },
    });
  }

  async findOne(id: number) {
    return this.formatear(await this.findActiva(id));
  }

  // The client's hair history, newest first, for any professional of the salon.
  async findDelCliente(clienteId: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { usuarioId: clienteId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    const fichas = await this.prisma.fichaTecnica.findMany({
      where: { fechaBaja: null, turnoDetalle: { turno: { clienteId } } },
      orderBy: [
        { turnoDetalle: { turno: { fecha: 'desc' } } },
        { turnoDetalle: { turno: { horaInicio: 'desc' } } },
        { turnoDetalleId: 'asc' },
      ],
      include: fichaInclude,
    });
    return fichas.map((f) => this.formatear(f));
  }

  // --- helpers ---

  private async findActiva(id: number): Promise<FichaCompleta> {
    const ficha = await this.prisma.fichaTecnica.findUnique({
      where: { id },
      include: fichaInclude,
    });
    if (!ficha || ficha.fechaBaja !== null) {
      throw new NotFoundException('Ficha no encontrada');
    }
    return ficha;
  }

  private async findParaEditar(
    id: number,
    actor: PublicUser,
  ): Promise<FichaCompleta> {
    const ficha = await this.findActiva(id);
    this.assertEsSuyo(ficha.turnoDetalle.profesionalId, actor);
    if (ficha.cerradaEn) {
      throw new BadRequestException(
        'La ficha está cerrada: el turno ya se completó',
      );
    }
    return ficha;
  }

  private assertEsSuyo(legajo: number, actor: PublicUser): void {
    if (actor.profesional?.legajo !== legajo) {
      throw new ForbiddenException(
        'Solo el profesional de ese servicio puede cargar o editar su ficha',
      );
    }
  }

  // "" in a text field clears it, like null.
  private limpiar<T extends FichaDto>(dto: T): T {
    const textos = [
      'tratamientosPrevios',
      'observacionesInternas',
      'indicacionesCliente',
    ] as const;
    const limpio = { ...dto };
    for (const campo of textos) {
      if (limpio[campo] === '') {
        limpio[campo] = null;
      }
    }
    return limpio;
  }

  private formatear(ficha: FichaCompleta) {
    const { turnoDetalle, turnoDetalleId: _detalle, ...campos } = ficha;
    const { turno, servicio, profesional } = turnoDetalle;
    return {
      ...campos,
      turnoId: turno.id,
      turnoDetalleId: turnoDetalle.id,
      clienteId: turno.clienteId,
      fecha: dateAFecha(turno.fecha),
      horaInicio: turno.horaInicio,
      servicio: servicio.tipo,
      legajo: profesional.legajo,
      profesional: `${profesional.usuario.nombre} ${profesional.usuario.apellido}`,
    };
  }
}
