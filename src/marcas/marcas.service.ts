import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { esErrorPrisma } from '../common/errores-prisma';
import { Marca } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';

const MARCA_EN_USO = 'La marca tiene artículos cargados: no se puede borrar';

function marcaRepetida(linea: string | null): ConflictException {
  return new ConflictException(
    linea
      ? 'Ya existe esa línea para esa marca'
      : 'Ya existe esa marca sin línea',
  );
}

@Injectable()
export class MarcasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Marca[]> {
    return this.prisma.marca.findMany({
      orderBy: [{ razonSocial: 'asc' }, { linea: 'asc' }],
    });
  }

  async create(dto: CreateMarcaDto): Promise<Marca> {
    const data = { razonSocial: dto.razonSocial, linea: dto.linea || null };
    await this.assertLibre(data.razonSocial, data.linea);
    try {
      return await this.prisma.marca.create({ data });
    } catch (error) {
      // Someone created the same one between the check and the insert.
      throw esErrorPrisma(error, 'P2002') ? marcaRepetida(data.linea) : error;
    }
  }

  async update(id: number, dto: UpdateMarcaDto): Promise<Marca> {
    const marca = await this.findOrFail(id);
    const razonSocial = dto.razonSocial ?? marca.razonSocial;
    const linea = dto.linea === undefined ? marca.linea : dto.linea || null;
    await this.assertLibre(razonSocial, linea, id);
    try {
      return await this.prisma.marca.update({
        where: { id },
        data: { razonSocial, linea },
      });
    } catch (error) {
      // Races with another request: a duplicate saved meanwhile, or the brand deleted.
      if (esErrorPrisma(error, 'P2002')) {
        throw marcaRepetida(linea);
      }
      if (esErrorPrisma(error, 'P2025')) {
        throw new NotFoundException('Marca no encontrada');
      }
      throw error;
    }
  }

  // The DER has no logical delete for brands: only one no item uses (not even inactive ones).
  async remove(id: number): Promise<void> {
    await this.findOrFail(id);
    const enUso = await this.prisma.articulo.count({ where: { marcaId: id } });
    if (enUso > 0) {
      throw new ConflictException(MARCA_EN_USO);
    }
    try {
      await this.prisma.marca.delete({ where: { id } });
    } catch (error) {
      // An item created meanwhile (the FK restricts the delete), or the brand already deleted.
      if (esErrorPrisma(error, 'P2003')) {
        throw new ConflictException(MARCA_EN_USO);
      }
      if (esErrorPrisma(error, 'P2025')) {
        throw new NotFoundException('Marca no encontrada');
      }
      throw error;
    }
  }

  async findOrFail(id: number): Promise<Marca> {
    const marca = await this.prisma.marca.findUnique({ where: { id } });
    if (!marca) {
      throw new NotFoundException('Marca no encontrada');
    }
    return marca;
  }

  // Checked in code: the unique index lets "Fidelité" without a line repeat (NULLs never collide).
  // With a line the index also backs it up (P2002, caught above). The collation is
  // case-insensitive, so "argán" and "Argán" are the same line.
  private async assertLibre(
    razonSocial: string,
    linea: string | null,
    id?: number,
  ): Promise<void> {
    const otra = await this.prisma.marca.findFirst({
      where: { razonSocial, linea, id: id ? { not: id } : undefined },
    });
    if (otra) {
      throw marcaRepetida(linea);
    }
  }
}
