import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { esErrorPrisma } from '../common/errores-prisma';
import { Categoria } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';

function nombreRepetido(): ConflictException {
  return new ConflictException('Ya existe una categoría con ese nombre');
}

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(incluirBajas = false): Promise<Categoria[]> {
    return this.prisma.categoria.findMany({
      where: { fechaBaja: incluirBajas ? undefined : null },
      orderBy: { nombre: 'asc' },
    });
  }

  async create(dto: CreateCategoriaDto): Promise<Categoria> {
    await this.assertNombreLibre(dto.nombre);
    try {
      return await this.prisma.categoria.create({ data: dto });
    } catch (error) {
      // Someone saved the same name between the check and the insert.
      throw esErrorPrisma(error, 'P2002') ? nombreRepetido() : error;
    }
  }

  async update(id: number, dto: UpdateCategoriaDto): Promise<Categoria> {
    await this.findActiva(id);
    if (dto.nombre !== undefined) {
      await this.assertNombreLibre(dto.nombre, id);
    }
    try {
      return await this.prisma.categoria.update({ where: { id }, data: dto });
    } catch (error) {
      // Someone saved the same name between the check and the update.
      throw esErrorPrisma(error, 'P2002') ? nombreRepetido() : error;
    }
  }

  /**
   * Logical delete: no longer offered for services. Not while an active service uses it, so an
   * active service always has an active category. The row lock (FOR UPDATE) waits for any service
   * being saved with this category (they lock it FOR SHARE, see ServiciosService), and the count
   * is a locking read too, so it sees the services committed in the meantime.
   */
  async deactivate(id: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ activa: bigint | number }[]>`
        SELECT fechaBaja IS NULL AS activa
        FROM Categoria WHERE id = ${id} FOR UPDATE`;
      if (!filas[0] || !Number(filas[0].activa)) {
        throw new NotFoundException('Categoría no encontrada');
      }
      const [{ total }] = await tx.$queryRaw<{ total: bigint | number }[]>`
        SELECT COUNT(*) AS total FROM Servicio
        WHERE categoriaId = ${id} AND fechaBaja IS NULL FOR SHARE`;
      const activos = Number(total);
      if (activos > 0) {
        throw new ConflictException(
          activos === 1
            ? 'La categoría tiene 1 servicio activo: pasalo a otra categoría o dalo de baja antes'
            : `La categoría tiene ${activos} servicios activos: pasalos a otra categoría o dalos de baja antes`,
        );
      }
      await tx.categoria.update({
        where: { id },
        data: { fechaBaja: new Date() },
      });
    });
  }

  async reactivate(id: number): Promise<Categoria> {
    const categoria = await this.prisma.categoria.findUnique({ where: { id } });
    if (!categoria) {
      throw new NotFoundException('Categoría no encontrada');
    }
    if (categoria.fechaBaja === null) {
      throw new BadRequestException('La categoría ya está activa');
    }
    return this.prisma.categoria.update({
      where: { id },
      data: { fechaBaja: null },
    });
  }

  // The collation is case- and accent-insensitive, so "Diagnostico" and "diagnóstico" are the same
  // name. The unique index backs it up when two requests race (P2002, caught in create and update).
  private async assertNombreLibre(nombre: string, id?: number): Promise<void> {
    const otra = await this.prisma.categoria.findUnique({ where: { nombre } });
    if (otra && otra.id !== id) {
      throw nombreRepetido();
    }
  }

  private async findActiva(id: number): Promise<Categoria> {
    const categoria = await this.prisma.categoria.findUnique({ where: { id } });
    if (!categoria || categoria.fechaBaja !== null) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return categoria;
  }
}
