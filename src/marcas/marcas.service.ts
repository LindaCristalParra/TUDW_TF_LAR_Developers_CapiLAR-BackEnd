import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Marca } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';

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
    return this.prisma.marca.create({ data });
  }

  async update(id: number, dto: UpdateMarcaDto): Promise<Marca> {
    const marca = await this.findOrFail(id);
    const razonSocial = dto.razonSocial ?? marca.razonSocial;
    const linea = dto.linea === undefined ? marca.linea : dto.linea || null;
    await this.assertLibre(razonSocial, linea, id);
    return this.prisma.marca.update({
      where: { id },
      data: { razonSocial, linea },
    });
  }

  // The DER has no logical delete for brands: only one no item uses (not even inactive ones).
  async remove(id: number): Promise<void> {
    await this.findOrFail(id);
    const enUso = await this.prisma.articulo.count({ where: { marcaId: id } });
    if (enUso > 0) {
      throw new ConflictException(
        'La marca tiene artículos cargados: no se puede borrar',
      );
    }
    await this.prisma.marca.delete({ where: { id } });
  }

  async findOrFail(id: number): Promise<Marca> {
    const marca = await this.prisma.marca.findUnique({ where: { id } });
    if (!marca) {
      throw new NotFoundException('Marca no encontrada');
    }
    return marca;
  }

  // Checked in code: the unique index lets "Fidelité" without a line repeat (NULLs never collide).
  // The collation is case-insensitive, so "argán" and "Argán" are the same line.
  private async assertLibre(
    razonSocial: string,
    linea: string | null,
    id?: number,
  ): Promise<void> {
    const otra = await this.prisma.marca.findFirst({
      where: { razonSocial, linea, id: id ? { not: id } : undefined },
    });
    if (otra) {
      throw new ConflictException(
        linea
          ? 'Ya existe esa línea para esa marca'
          : 'Ya existe esa marca sin línea',
      );
    }
  }
}
