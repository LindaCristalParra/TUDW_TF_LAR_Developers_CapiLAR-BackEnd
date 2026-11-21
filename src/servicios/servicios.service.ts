import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ArchivoSubido, FotosService } from '../fotos/fotos.service';
import { Prisma, Servicio } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServicioDto } from './dto/create-servicio.dto';
import { UpdateServicioDto } from './dto/update-servicio.dto';

// Every service response carries its category, so the front can group them (PWA-288).
export const servicioInclude = {
  categoria: { select: { id: true, nombre: true } },
} satisfies Prisma.ServicioInclude;

export type ServicioConCategoria = Prisma.ServicioGetPayload<{
  include: typeof servicioInclude;
}>;

@Injectable()
export class ServiciosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fotosService: FotosService,
  ) {}

  findAll(
    incluirBajas = false,
    categoriaId?: number,
  ): Promise<ServicioConCategoria[]> {
    return this.prisma.servicio.findMany({
      where: { fechaBaja: incluirBajas ? undefined : null, categoriaId },
      include: servicioInclude,
      orderBy: { tipo: 'asc' },
    });
  }

  create(dto: CreateServicioDto): Promise<ServicioConCategoria> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCategoriaActiva(tx, dto.categoriaId);
      return tx.servicio.create({
        data: { ...dto, descripcion: dto.descripcion || null },
        include: servicioInclude,
      });
    });
  }

  async update(
    id: number,
    dto: UpdateServicioDto,
  ): Promise<ServicioConCategoria> {
    await this.findActivo(id);
    const data =
      dto.descripcion === undefined
        ? dto
        : { ...dto, descripcion: dto.descripcion || null };
    return this.prisma.$transaction(async (tx) => {
      if (dto.categoriaId !== undefined) {
        await this.assertCategoriaActiva(tx, dto.categoriaId);
      }
      return tx.servicio.update({
        where: { id },
        data,
        include: servicioInclude,
      });
    });
  }

  // Logical delete (ARQ-01): past turnos keep pointing to the service.
  async deactivate(id: number): Promise<void> {
    await this.findActivo(id);
    await this.prisma.servicio.update({
      where: { id },
      data: { fechaBaja: new Date() },
    });
  }

  // An active service always has an active category: if its category was deactivated meanwhile,
  // the category has to be reactivated first.
  async reactivate(id: number): Promise<ServicioConCategoria> {
    const servicio = await this.prisma.servicio.findUnique({ where: { id } });
    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado');
    }
    if (servicio.fechaBaja === null) {
      throw new BadRequestException('El servicio ya está activo');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.assertCategoriaActiva(
        tx,
        servicio.categoriaId,
        'La categoría del servicio está dada de baja: reactivala o cambiala antes',
      );
      return tx.servicio.update({
        where: { id },
        data: { fechaBaja: null },
        include: servicioInclude,
      });
    });
  }

  async cambiarFoto(
    id: number,
    archivo: ArchivoSubido | undefined,
  ): Promise<ServicioConCategoria> {
    const servicio = await this.findActivo(id);
    const nombre = await this.fotosService.guardar(archivo);
    let updated: ServicioConCategoria;
    try {
      updated = await this.prisma.servicio.update({
        where: { id },
        data: { foto: nombre },
        include: servicioInclude,
      });
    } catch (error) {
      await this.fotosService.borrar(nombre);
      throw error;
    }
    await this.fotosService.borrar(servicio.foto);
    return updated;
  }

  async quitarFoto(id: number): Promise<ServicioConCategoria> {
    const servicio = await this.findActivo(id);
    if (!servicio.foto) {
      throw new NotFoundException('El servicio no tiene foto');
    }
    const updated = await this.prisma.servicio.update({
      where: { id },
      data: { foto: null },
      include: servicioInclude,
    });
    await this.fotosService.borrar(servicio.foto);
    return updated;
  }

  // Also for inactive services, so past turnos can still show it.
  async verFoto(id: number): Promise<StreamableFile> {
    const servicio = await this.prisma.servicio.findUnique({
      where: { id },
      select: { foto: true },
    });
    return this.fotosService.leer(servicio?.foto);
  }

  // A missing or deactivated category is the client's mistake (400). FOR SHARE keeps the category
  // from being deactivated until the service is saved (deactivating it locks it FOR UPDATE and
  // checks that no active service uses it), while services can still be saved in parallel.
  private async assertCategoriaActiva(
    tx: Prisma.TransactionClient,
    categoriaId: number,
    mensajeBaja = 'La categoría está dada de baja',
  ): Promise<void> {
    const filas = await tx.$queryRaw<{ activa: bigint | number }[]>`
      SELECT fechaBaja IS NULL AS activa
      FROM Categoria WHERE id = ${categoriaId} FOR SHARE`;
    if (!filas[0]) {
      throw new BadRequestException('La categoría no existe');
    }
    if (!Number(filas[0].activa)) {
      throw new BadRequestException(mensajeBaja);
    }
  }

  private async findActivo(id: number): Promise<Servicio> {
    const servicio = await this.prisma.servicio.findUnique({ where: { id } });
    if (!servicio || servicio.fechaBaja !== null) {
      throw new NotFoundException('Servicio no encontrado');
    }
    return servicio;
  }
}
