import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ahoraEnSalon, dateAFecha } from '../common/fecha-hora';
import { ArchivoSubido, FotosService } from '../fotos/fotos.service';
import {
  EstadoTurno,
  MomentoFoto,
  Prisma,
  Rol,
  UsoArticulo,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tramosDeDetalles } from '../turnos/agenda';
import { PublicUser } from '../users/users.service';
import { ConsumoService, gramosPorArticulo } from './consumo.service';
import { CreateFichaDto } from './dto/create-ficha.dto';
import { FichaDto } from './dto/ficha.dto';
import { FormulaDto } from './dto/formula.dto';

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
  formulas: {
    orderBy: { orden: 'asc' },
    include: { insumos: { orderBy: { id: 'asc' } } },
  },
  fotos: { orderBy: { id: 'asc' } },
} satisfies Prisma.FichaTecnicaInclude;

type FichaCompleta = Prisma.FichaTecnicaGetPayload<{
  include: typeof fichaInclude;
}>;

const MAX_FOTOS_POR_MOMENTO = 5;

@Injectable()
export class FichasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fotosService: FotosService,
    private readonly consumoService: ConsumoService,
  ) {}

  // Only the professional of that service, while the turno is CONFIRMADO and once the service started.
  async create(turnoId: number, dto: CreateFichaDto, actor: PublicUser) {
    const { turnoDetalleId, formulas, ...campos } = dto;
    const detalle = await this.prisma.turnoDetalle.findUnique({
      where: { id: turnoDetalleId },
      include: {
        turno: {
          select: {
            estado: true,
            fecha: true,
            horaInicio: true,
            // All the services, to know when this one starts.
            detalles: {
              orderBy: { id: 'asc' },
              select: {
                id: true,
                servicio: { select: { tiempoDuracion: true } },
              },
            },
          },
        },
      },
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
    const { turno } = detalle;
    const inicio = tramosDeDetalles(turno.horaInicio, turno.detalles).find(
      (t) => t.detalle.id === turnoDetalleId,
    )!.inicio;
    const fecha = dateAFecha(turno.fecha);
    const ahora = ahoraEnSalon();
    if (
      fecha > ahora.fecha ||
      (fecha === ahora.fecha && inicio > ahora.minutos)
    ) {
      throw new BadRequestException(
        'La ficha se carga desde que empieza el servicio',
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
      data: {
        turnoDetalleId,
        ...this.limpiar(campos),
        formulas: { create: await this.formulasData(formulas ?? []) },
      },
      include: fichaInclude,
    });
    return this.formatear(ficha);
  }

  // Formulas sent → they replace the old ones (in the same update); not sent → untouched.
  // A closed record's stock was already discounted: new formulas move only the difference (PWA-176),
  // and sinStock tells which items went below 0.
  async update(id: number, dto: FichaDto, actor: PublicUser) {
    const ficha = await this.findParaEditar(id, actor);
    const { formulas, ...campos } = dto;
    const yaEnLaFicha = new Set(
      ficha.formulas.flatMap((f) =>
        f.insumos.flatMap((i) => (i.articuloId != null ? [i.articuloId] : [])),
      ),
    );
    const nuevas = formulas && (await this.formulasData(formulas, yaEnLaFicha));
    const sinStock = await this.prisma.$transaction(
      async (tx) => {
        // Like completing the turno (record first, then items): an edit and a completion of the
        // same record wait for each other, so the closing and the supplies are read as they are now.
        await tx.$queryRaw`SELECT id FROM FichaTecnica WHERE id = ${id} FOR UPDATE`;
        const actual = await tx.fichaTecnica.findUniqueOrThrow({
          where: { id },
          select: {
            cerradaEn: true,
            fechaBaja: true,
            formulas: {
              select: {
                insumos: { select: { articuloId: true, cantidad: true } },
              },
            },
          },
        });
        if (actual.fechaBaja) {
          throw new NotFoundException('Ficha no encontrada');
        }
        await tx.fichaTecnica.update({
          where: { id },
          data: {
            ...this.limpiar(campos),
            formulas: nuevas && { deleteMany: {}, create: nuevas },
          },
        });
        if (!nuevas || !actual.cerradaEn) {
          return undefined;
        }
        const gramosAntes = gramosPorArticulo(
          actual.formulas.flatMap((f) => f.insumos),
        );
        return this.consumoService.ajustar(tx, [{ id, gramosAntes }]);
      },
      // Like a manual movement: it may wait for other movements of the same items.
      { maxWait: 10_000, timeout: 10_000 },
    );
    const actualizada = await this.findOne(id);
    return sinStock ? { ...actualizada, sinStock } : actualizada;
  }

  // Logical delete, only while it's open: a closed one is part of the client's history.
  async deactivate(id: number, actor: PublicUser): Promise<void> {
    const ficha = await this.findParaEditar(id, actor);
    if (ficha.cerradaEn) {
      throw new BadRequestException(
        'La ficha está cerrada: el turno ya se completó',
      );
    }
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

  // The client's own records, once closed: only the care instructions and the photos.
  async findMias(actor: PublicUser) {
    const fichas = await this.prisma.fichaTecnica.findMany({
      where: {
        fechaBaja: null,
        cerradaEn: { not: null },
        turnoDetalle: { turno: { clienteId: actor.id } },
      },
      orderBy: [
        { turnoDetalle: { turno: { fecha: 'desc' } } },
        { turnoDetalle: { turno: { horaInicio: 'desc' } } },
        { turnoDetalleId: 'asc' },
      ],
      include: fichaInclude,
    });
    return fichas.map((f) => this.formatearParaCliente(f));
  }

  async subirFoto(
    id: number,
    tipo: MomentoFoto,
    archivo: ArchivoSubido | undefined,
    actor: PublicUser,
  ) {
    const ficha = await this.findParaEditar(id, actor);
    if (
      ficha.fotos.filter((f) => f.tipo === tipo).length >= MAX_FOTOS_POR_MOMENTO
    ) {
      throw new BadRequestException(
        `La ficha ya tiene ${MAX_FOTOS_POR_MOMENTO} fotos de ${tipo === MomentoFoto.ANTES ? 'antes' : 'después'}`,
      );
    }
    const nombre = await this.fotosService.guardar(archivo);
    try {
      // Through the record, so actualizadaEn shows the photo change too.
      await this.prisma.fichaTecnica.update({
        where: { id },
        data: {
          actualizadaEn: new Date(),
          fotos: { create: { tipo, archivo: nombre } },
        },
      });
    } catch (error) {
      await this.fotosService.borrar(nombre);
      throw error;
    }
    return this.findOne(id);
  }

  // The file is deleted too, also from a closed record (the client stops seeing it).
  async quitarFoto(id: number, fotoId: number, actor: PublicUser) {
    const ficha = await this.findParaEditar(id, actor);
    const foto = ficha.fotos.find((f) => f.id === fotoId);
    if (!foto) {
      throw new NotFoundException('Foto no encontrada');
    }
    await this.prisma.fichaTecnica.update({
      where: { id },
      data: { actualizadaEn: new Date(), fotos: { delete: { id: fotoId } } },
    });
    await this.fotosService.borrar(foto.archivo);
    return this.findOne(id);
  }

  // Any professional; the client only their own, once the record is closed (404 otherwise).
  async verFoto(
    id: number,
    fotoId: number,
    actor: PublicUser,
  ): Promise<StreamableFile> {
    const foto = await this.prisma.fotoFicha.findUnique({
      where: { id: fotoId },
      include: {
        ficha: {
          select: {
            fechaBaja: true,
            cerradaEn: true,
            turnoDetalle: {
              select: { turno: { select: { clienteId: true } } },
            },
          },
        },
      },
    });
    const { ficha } = foto ?? {};
    const puedeVer =
      actor.rol === Rol.PROFESIONAL ||
      (ficha?.cerradaEn != null &&
        ficha.turnoDetalle.turno.clienteId === actor.id);
    if (!foto || foto.fichaId !== id || ficha?.fechaBaja || !puedeVer) {
      throw new NotFoundException('Foto no encontrada');
    }
    return this.fotosService.leer(foto.archivo);
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

  // Also once closed (PWA-255): its professional keeps editing it from the client's history.
  private async findParaEditar(
    id: number,
    actor: PublicUser,
  ): Promise<FichaCompleta> {
    const ficha = await this.findActiva(id);
    this.assertEsSuyo(ficha.turnoDetalle.profesionalId, actor);
    return ficha;
  }

  private assertEsSuyo(legajo: number, actor: PublicUser): void {
    if (actor.profesional?.legajo !== legajo) {
      throw new ForbiddenException(
        'Solo el profesional de ese servicio puede cargar o editar su ficha',
      );
    }
  }

  // The order of the list is the order they were applied in (orden 1, 2, 3...).
  // A supply with articuloId takes producto, marca, tono and unidad from the item.
  private async formulasData(
    formulas: FormulaDto[],
    yaEnLaFicha = new Set<number>(),
  ): Promise<Prisma.FormulaCreateWithoutFichaInput[]> {
    const articulos = await this.articulosDeInsumos(formulas, yaEnLaFicha);
    return formulas.map((f, i) => ({
      descripcion: f.descripcion || null,
      oxidanteVolumen: f.oxidanteVolumen,
      tiempoPoseMin: f.tiempoPoseMin,
      orden: i + 1,
      insumos: {
        create: (f.insumos ?? []).map((insumo) => {
          const articulo =
            insumo.articuloId != null && articulos.get(insumo.articuloId);
          if (!articulo) {
            return {
              producto: insumo.producto!,
              marca: insumo.marca || null,
              tono: insumo.tono || null,
              cantidad: insumo.cantidad,
              unidad: insumo.unidad,
            };
          }
          const { razonSocial, linea } = articulo.marca;
          return {
            producto: articulo.nombre,
            marca: linea ? `${razonSocial} ${linea}` : razonSocial,
            tono: articulo.tonalidad,
            cantidad: insumo.cantidad,
            unidad: articulo.tipoPeso,
            articuloId: articulo.id,
          };
        }),
      },
    }));
  }

  // Only active items used in the salon (SALON or AMBOS); anything else is a 400.
  // One already saved in this record (yaEnLaFicha) can stay even if it was later deactivated or switched to
  // VENTA, so the record can still be edited.
  private async articulosDeInsumos(
    formulas: FormulaDto[],
    yaEnLaFicha: Set<number>,
  ) {
    const ids = [
      ...new Set(
        formulas.flatMap((f) =>
          (f.insumos ?? []).flatMap((insumo) =>
            insumo.articuloId != null ? [insumo.articuloId] : [],
          ),
        ),
      ),
    ];
    const articulos = ids.length
      ? await this.prisma.articulo.findMany({
          where: { id: { in: ids } },
          include: { marca: true },
        })
      : [];
    const porId = new Map(articulos.map((a) => [a.id, a]));
    for (const id of ids) {
      const articulo = porId.get(id);
      if (!articulo) {
        throw new BadRequestException(`El artículo ${id} no existe`);
      }
      if (yaEnLaFicha.has(id)) {
        continue;
      }
      if (articulo.fechaBaja) {
        throw new BadRequestException(
          `El artículo ${id} (${articulo.nombre}) está dado de baja`,
        );
      }
      if (articulo.uso === UsoArticulo.VENTA) {
        throw new BadRequestException(
          `El artículo ${id} (${articulo.nombre}) es solo de venta: no se usa en el salón`,
        );
      }
    }
    return porId;
  }

  // "" in a text field clears it, like null.
  private limpiar<T extends Omit<FichaDto, 'formulas'>>(dto: T): T {
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
    const {
      turnoDetalle,
      turnoDetalleId: _detalle,
      formulas,
      fotos,
      ...campos
    } = ficha;
    const { turno, servicio, profesional } = turnoDetalle;
    return {
      ...campos,
      formulas: formulas.map(({ fichaId: _ficha, insumos, ...formula }) => ({
        ...formula,
        insumos: insumos.map(({ formulaId: _formula, ...insumo }) => insumo),
      })),
      fotos: this.formatearFotos(fotos),
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

  // Without the diagnosis, the formulas or the internal notes.
  private formatearParaCliente(ficha: FichaCompleta) {
    const { turno, servicio, profesional } = ficha.turnoDetalle;
    return {
      id: ficha.id,
      turnoId: turno.id,
      fecha: dateAFecha(turno.fecha),
      horaInicio: turno.horaInicio,
      servicio: servicio.tipo,
      profesional: `${profesional.usuario.nombre} ${profesional.usuario.apellido}`,
      indicacionesCliente: ficha.indicacionesCliente,
      fotos: this.formatearFotos(ficha.fotos),
    };
  }

  // The image itself is at GET /fichas/:id/fotos/:fotoId.
  private formatearFotos(fotos: FichaCompleta['fotos']) {
    return fotos.map(({ id, tipo, creadaEn }) => ({ id, tipo, creadaEn }));
  }
}
