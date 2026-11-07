import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { esErrorPrisma } from '../common/errores-prisma';
import { Prisma, Proveedor } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { limpiarCuit } from './cuit';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { ListProveedoresQueryDto } from './dto/list-proveedores-query.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';

const NO_ENCONTRADO = 'Proveedor no encontrado';
const CUIT_REPETIDO = 'Ya existe un proveedor con ese CUIT';

// A repeated CUIT is stopped by the unique index (also against inactive suppliers): two requests at
// the same time can't both insert, the second gets P2002 → 409.
@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListProveedoresQueryDto): Promise<Proveedor[]> {
    const cuit = query.search ? limpiarCuit(query.search) : '';
    return this.prisma.proveedor.findMany({
      where: {
        fechaBaja: query.incluirBajas ? undefined : null,
        OR: query.search
          ? [
              { razonSocial: { contains: query.search } },
              // Digits only: "30-7123" finds 30712345678; text like "meraki" doesn't look at the CUIT.
              ...(/^\d+$/.test(cuit) ? [{ cuit: { contains: cuit } }] : []),
            ]
          : undefined,
      },
      orderBy: [{ razonSocial: 'asc' }, { id: 'asc' }],
    });
  }

  // Also an inactive one (fechaBaja set), so past purchases can show it.
  async findOrFail(id: number): Promise<Proveedor> {
    const proveedor = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!proveedor) {
      throw new NotFoundException(NO_ENCONTRADO);
    }
    return proveedor;
  }

  async create(dto: CreateProveedorDto): Promise<Proveedor> {
    try {
      return await this.prisma.proveedor.create({
        data: {
          cuit: dto.cuit,
          razonSocial: dto.razonSocial,
          telefono: dto.telefono ?? null,
          email: dto.email ?? null,
          condicionesComerciales: dto.condicionesComerciales ?? null,
        },
      });
    } catch (error) {
      throw esErrorPrisma(error, 'P2002')
        ? new ConflictException(CUIT_REPETIDO)
        : error;
    }
  }

  // The edits and the deactivation/reactivation use updateMany with the condition on fechaBaja in
  // the UPDATE itself and look at the count: update() with a non-unique filter first reads and then
  // writes by id, so two requests at the same time could both pass (tested: 6 deactivations → 6×200).

  // Like items: only an active supplier is edited (404 otherwise).
  async update(id: number, dto: UpdateProveedorDto): Promise<Proveedor> {
    const data: Prisma.ProveedorUpdateManyMutationInput = {
      cuit: dto.cuit,
      razonSocial: dto.razonSocial,
      telefono: dto.telefono,
      email: dto.email,
      condicionesComerciales: dto.condicionesComerciales,
    };
    // Without fields Prisma sends no UPDATE and the count is 0: just check it exists and is active.
    if (Object.values(data).every((valor) => valor === undefined)) {
      const activo = await this.prisma.proveedor.findFirst({
        where: { id, fechaBaja: null },
      });
      if (!activo) {
        throw new NotFoundException(NO_ENCONTRADO);
      }
      return activo;
    }
    try {
      const { count } = await this.prisma.proveedor.updateMany({
        where: { id, fechaBaja: null },
        data,
      });
      if (count === 0) {
        throw new NotFoundException(NO_ENCONTRADO);
      }
    } catch (error) {
      throw esErrorPrisma(error, 'P2002')
        ? new ConflictException(CUIT_REPETIDO)
        : error;
    }
    return this.findOrFail(id);
  }

  // Logical delete: no new purchases from it, but past purchases keep pointing to it.
  // 404 if it doesn't exist or was already inactive (like items).
  async deactivate(id: number): Promise<void> {
    const { count } = await this.prisma.proveedor.updateMany({
      where: { id, fechaBaja: null },
      data: { fechaBaja: new Date() },
    });
    if (count === 0) {
      throw new NotFoundException(NO_ENCONTRADO);
    }
  }

  async reactivate(id: number): Promise<Proveedor> {
    const { count } = await this.prisma.proveedor.updateMany({
      where: { id, fechaBaja: { not: null } },
      data: { fechaBaja: null },
    });
    // Either it doesn't exist (404) or it is already active (400).
    const proveedor = await this.findOrFail(id);
    if (count === 0) {
      throw new BadRequestException('El proveedor ya está activo');
    }
    return proveedor;
  }
}
