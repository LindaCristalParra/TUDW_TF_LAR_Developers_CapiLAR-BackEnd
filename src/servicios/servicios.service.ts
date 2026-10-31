import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ArchivoSubido, FotosService } from '../fotos/fotos.service';
import { Servicio } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServicioDto } from './dto/create-servicio.dto';
import { UpdateServicioDto } from './dto/update-servicio.dto';

@Injectable()
export class ServiciosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fotosService: FotosService,
  ) {}

  findAll(incluirBajas = false): Promise<Servicio[]> {
    return this.prisma.servicio.findMany({
      where: { fechaBaja: incluirBajas ? undefined : null },
      orderBy: { tipo: 'asc' },
    });
  }

  create(dto: CreateServicioDto): Promise<Servicio> {
    return this.prisma.servicio.create({
      data: { ...dto, descripcion: dto.descripcion || null },
    });
  }

  async update(id: number, dto: UpdateServicioDto): Promise<Servicio> {
    await this.findActivo(id);
    const data =
      dto.descripcion === undefined
        ? dto
        : { ...dto, descripcion: dto.descripcion || null };
    return this.prisma.servicio.update({ where: { id }, data });
  }

  // Logical delete (ARQ-01): past turnos keep pointing to the service.
  async deactivate(id: number): Promise<void> {
    await this.findActivo(id);
    await this.prisma.servicio.update({
      where: { id },
      data: { fechaBaja: new Date() },
    });
  }

  async reactivate(id: number): Promise<Servicio> {
    const servicio = await this.prisma.servicio.findUnique({ where: { id } });
    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado');
    }
    if (servicio.fechaBaja === null) {
      throw new BadRequestException('El servicio ya está activo');
    }
    return this.prisma.servicio.update({
      where: { id },
      data: { fechaBaja: null },
    });
  }

  async cambiarFoto(
    id: number,
    archivo: ArchivoSubido | undefined,
  ): Promise<Servicio> {
    const servicio = await this.findActivo(id);
    const nombre = await this.fotosService.guardar(archivo);
    let updated: Servicio;
    try {
      updated = await this.prisma.servicio.update({
        where: { id },
        data: { foto: nombre },
      });
    } catch (error) {
      await this.fotosService.borrar(nombre);
      throw error;
    }
    await this.fotosService.borrar(servicio.foto);
    return updated;
  }

  async quitarFoto(id: number): Promise<Servicio> {
    const servicio = await this.findActivo(id);
    if (!servicio.foto) {
      throw new NotFoundException('El servicio no tiene foto');
    }
    const updated = await this.prisma.servicio.update({
      where: { id },
      data: { foto: null },
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

  private async findActivo(id: number): Promise<Servicio> {
    const servicio = await this.prisma.servicio.findUnique({ where: { id } });
    if (!servicio || servicio.fechaBaja !== null) {
      throw new NotFoundException('Servicio no encontrado');
    }
    return servicio;
  }
}
