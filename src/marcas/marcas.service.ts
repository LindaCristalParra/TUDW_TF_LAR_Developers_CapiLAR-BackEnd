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
import { lineaParaBase, MarcaApi, marcaParaApi } from './marca-api';

const MARCA_EN_USO = 'La marca tiene artículos cargados: no se puede borrar';

function marcaRepetida(linea: string): ConflictException {
  return new ConflictException(
    linea
      ? 'Ya existe esa línea para esa marca'
      : 'Ya existe esa marca sin línea',
  );
}

// Duplicates are stopped by the unique index (razonSocial, linea), also without a line ('' is
// stored, not NULL): two requests at the same time can't both insert, the second gets P2002 → 409.
// The collation is case-insensitive, so "argán" and "Argán" are the same line.
@Injectable()
export class MarcasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<MarcaApi[]> {
    const marcas = await this.prisma.marca.findMany({
      orderBy: [{ razonSocial: 'asc' }, { linea: 'asc' }],
    });
    return marcas.map(marcaParaApi);
  }

  async create(dto: CreateMarcaDto): Promise<MarcaApi> {
    const data = {
      razonSocial: dto.razonSocial,
      linea: lineaParaBase(dto.linea),
    };
    try {
      return marcaParaApi(await this.prisma.marca.create({ data }));
    } catch (error) {
      throw esErrorPrisma(error, 'P2002') ? marcaRepetida(data.linea) : error;
    }
  }

  async update(id: number, dto: UpdateMarcaDto): Promise<MarcaApi> {
    const marca = await this.findOrFail(id);
    const razonSocial = dto.razonSocial ?? marca.razonSocial;
    const linea =
      dto.linea === undefined ? marca.linea : lineaParaBase(dto.linea);
    try {
      return marcaParaApi(
        await this.prisma.marca.update({
          where: { id },
          data: { razonSocial, linea },
        }),
      );
    } catch (error) {
      if (esErrorPrisma(error, 'P2002')) {
        throw marcaRepetida(linea);
      }
      // Deleted between the lookup and the update.
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

  // The row as stored (linea '' when there is none); for the API use marcaParaApi.
  async findOrFail(id: number): Promise<Marca> {
    const marca = await this.prisma.marca.findUnique({ where: { id } });
    if (!marca) {
      throw new NotFoundException('Marca no encontrada');
    }
    return marca;
  }
}
