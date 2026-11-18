import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { esErrorPrisma } from '../common/errores-prisma';
import { Alergia } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlergiaDto } from './dto/create-alergia.dto';
import { UpdateAlergiaDto } from './dto/update-alergia.dto';

function nombreRepetido(): ConflictException {
  return new ConflictException('Ya existe una alergia con ese nombre');
}

@Injectable()
export class AlergiasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(incluirBajas = false): Promise<Alergia[]> {
    return this.prisma.alergia.findMany({
      where: { fechaBaja: incluirBajas ? undefined : null },
      orderBy: { nombre: 'asc' },
    });
  }

  async create(dto: CreateAlergiaDto): Promise<Alergia> {
    await this.assertNombreLibre(dto.nombre);
    try {
      return await this.prisma.alergia.create({
        data: { ...dto, descripcion: dto.descripcion || null },
      });
    } catch (error) {
      // Someone saved the same name between the check and the insert.
      throw esErrorPrisma(error, 'P2002') ? nombreRepetido() : error;
    }
  }

  async update(id: number, dto: UpdateAlergiaDto): Promise<Alergia> {
    await this.findActiva(id);
    if (dto.nombre !== undefined) {
      await this.assertNombreLibre(dto.nombre, id);
    }
    const data =
      dto.descripcion === undefined
        ? dto
        : { ...dto, descripcion: dto.descripcion || null };
    try {
      return await this.prisma.alergia.update({ where: { id }, data });
    } catch (error) {
      // Someone saved the same name between the check and the update.
      throw esErrorPrisma(error, 'P2002') ? nombreRepetido() : error;
    }
  }

  // Logical delete: it is no longer offered, but clients who have it keep showing it.
  async deactivate(id: number): Promise<void> {
    await this.findActiva(id);
    await this.prisma.alergia.update({
      where: { id },
      data: { fechaBaja: new Date() },
    });
  }

  async reactivate(id: number): Promise<Alergia> {
    const alergia = await this.prisma.alergia.findUnique({ where: { id } });
    if (!alergia) {
      throw new NotFoundException('Alergia no encontrada');
    }
    if (alergia.fechaBaja === null) {
      throw new BadRequestException('La alergia ya está activa');
    }
    return this.prisma.alergia.update({
      where: { id },
      data: { fechaBaja: null },
    });
  }

  /**
   * Checks the ids a client picks (sign-up, profile): they must exist and be active,
   * or already be hers (an inactive one she had stays if the front sends her list again).
   * Returns them without repeats.
   */
  async validarIds(ids: number[], clienteId?: number): Promise<number[]> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) {
      return [];
    }
    const validas = await this.prisma.alergia.count({
      where: {
        id: { in: unicos },
        OR: [
          { fechaBaja: null },
          ...(clienteId ? [{ clientes: { some: { clienteId } } }] : []),
        ],
      },
    });
    if (validas !== unicos.length) {
      throw new BadRequestException(
        'Alguna de las alergias elegidas no existe o ya no está disponible',
      );
    }
    return unicos;
  }

  // The collation is case-insensitive, so "látex" and "Látex" are the same name. The unique
  // index backs it up when two requests race (P2002, caught in create and update).
  private async assertNombreLibre(nombre: string, id?: number): Promise<void> {
    const otra = await this.prisma.alergia.findUnique({ where: { nombre } });
    if (otra && otra.id !== id) {
      throw nombreRepetido();
    }
  }

  private async findActiva(id: number): Promise<Alergia> {
    const alergia = await this.prisma.alergia.findUnique({ where: { id } });
    if (!alergia || alergia.fechaBaja !== null) {
      throw new NotFoundException('Alergia no encontrada');
    }
    return alergia;
  }
}
