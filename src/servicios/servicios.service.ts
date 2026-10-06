import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Servicio } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServicioDto } from './dto/create-servicio.dto';
import { UpdateServicioDto } from './dto/update-servicio.dto';

@Injectable()
export class ServiciosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(incluirBajas = false): Promise<Servicio[]> {
    return this.prisma.servicio.findMany({
      where: { fechaBaja: incluirBajas ? undefined : null },
      orderBy: { tipo: 'asc' },
    });
  }

  create(dto: CreateServicioDto): Promise<Servicio> {
    return this.prisma.servicio.create({ data: dto });
  }

  async update(id: number, dto: UpdateServicioDto): Promise<Servicio> {
    await this.findActivo(id);
    return this.prisma.servicio.update({ where: { id }, data: dto });
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

  private async findActivo(id: number): Promise<Servicio> {
    const servicio = await this.prisma.servicio.findUnique({ where: { id } });
    if (!servicio || servicio.fechaBaja !== null) {
      throw new NotFoundException('Servicio no encontrado');
    }
    return servicio;
  }
}
