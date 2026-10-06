import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Rol, Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

// Subtype rows (DER: Cliente / Profesional) loaded with the user.
const perfilInclude = {
  cliente: true,
  profesional: true,
} satisfies Prisma.UsuarioInclude;

export type UsuarioConPerfil = Prisma.UsuarioGetPayload<{
  include: typeof perfilInclude;
}>;

export type PublicUser = Omit<
  UsuarioConPerfil,
  'contrasena' | 'resetToken' | 'resetTokenExpira'
>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UsuarioCreateInput): Promise<UsuarioConPerfil> {
    return this.prisma.usuario.create({ data, include: perfilInclude });
  }

  findByEmail(email: string): Promise<UsuarioConPerfil | null> {
    return this.prisma.usuario.findUnique({
      where: { email },
      include: perfilInclude,
    });
  }

  findById(id: number): Promise<UsuarioConPerfil | null> {
    return this.prisma.usuario.findUnique({
      where: { id },
      include: perfilInclude,
    });
  }

  async updateProfile(
    user: PublicUser,
    dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    const email = dto.email?.toLowerCase();
    if (email && email !== user.email && (await this.findByEmail(email))) {
      throw new ConflictException('El email ya está registrado');
    }
    // By role, not by the Cliente row: that row is kept when a client is promoted.
    if (dto.alergia !== undefined && user.rol !== Rol.CLIENTE) {
      throw new BadRequestException('Solo los clientes pueden cargar alergias');
    }

    const alergia = dto.alergia || null;
    const updated = await this.prisma.usuario.update({
      where: { id: user.id },
      data: {
        nombre: dto.nombre,
        apellido: dto.apellido,
        email,
        telefono: dto.telefono,
        cliente:
          dto.alergia === undefined
            ? undefined
            : { upsert: { create: { alergia }, update: { alergia } } },
      },
      include: perfilInclude,
    });
    return this.toPublic(updated);
  }

  // F02: user list for admins.
  async findAll(query: ListUsersQueryDto): Promise<PublicUser[]> {
    const users = await this.prisma.usuario.findMany({
      where: {
        rol: query.rol,
        fechaBaja: query.incluirBajas ? undefined : null,
        OR: query.search
          ? [
              { nombre: { contains: query.search } },
              { apellido: { contains: query.search } },
              { email: { contains: query.search } },
            ]
          : undefined,
      },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      include: perfilInclude,
    });
    return users.map((user) => this.toPublic(user));
  }

  // F02: role change. The current role (Usuario.rol) is the "estado del rol" F02 asks for.
  async changeRol(
    id: number,
    rol: Rol,
    actor: PublicUser,
  ): Promise<PublicUser> {
    // An admin can't change their own role, so there is always at least one admin.
    if (id === actor.id) {
      throw new ForbiddenException('No podés cambiar tu propio rol');
    }

    const user = await this.findById(id);
    if (!user || user.fechaBaja !== null) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (user.rol === rol) {
      throw new BadRequestException(`El usuario ya tiene el rol ${rol}`);
    }

    const updated = await this.prisma.usuario.update({
      where: { id },
      data: {
        rol,
        // Subtype rows are created when missing and never deleted (ARQ-01):
        // a professional demoted and promoted again keeps the same legajo.
        profesional:
          rol === Rol.PROFESIONAL && !user.profesional
            ? { create: {} }
            : undefined,
        cliente:
          rol === Rol.CLIENTE && !user.cliente ? { create: {} } : undefined,
      },
      include: perfilInclude,
    });
    return this.toPublic(updated);
  }

  // Logical delete (ARQ-01): the row stays, fechaBaja blocks login and any
  // token still in use (JwtStrategy reloads the user on every request).
  async deactivate(id: number, actor: PublicUser): Promise<void> {
    // An admin can't remove themselves, so there is always at least one admin.
    if (id === actor.id && actor.rol === Rol.ADMIN) {
      throw new ForbiddenException(
        'Un administrador no puede darse de baja a sí mismo',
      );
    }

    const user = await this.findById(id);
    if (!user || user.fechaBaja !== null) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.prisma.usuario.update({
      where: { id },
      data: { fechaBaja: new Date(), resetToken: null, resetTokenExpira: null },
    });
  }

  // Undoes a logical delete: the user can log in again with the same account.
  async reactivate(id: number): Promise<PublicUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (user.fechaBaja === null) {
      throw new BadRequestException('El usuario ya está activo');
    }

    const updated = await this.prisma.usuario.update({
      where: { id },
      data: { fechaBaja: null },
      include: perfilInclude,
    });
    return this.toPublic(updated);
  }

  toPublic(user: UsuarioConPerfil): PublicUser {
    const {
      contrasena: _contrasena,
      resetToken: _resetToken,
      resetTokenExpira: _resetTokenExpira,
      ...publicUser
    } = user;
    return publicUser;
  }

  setResetToken(id: number, tokenHash: string, expira: Date): Promise<Usuario> {
    return this.prisma.usuario.update({
      where: { id },
      data: { resetToken: tokenHash, resetTokenExpira: expira },
    });
  }

  findByResetToken(tokenHash: string): Promise<Usuario | null> {
    return this.prisma.usuario.findFirst({ where: { resetToken: tokenHash } });
  }

  // Clears the reset token too, so each token can only be used once.
  updatePassword(id: number, contrasenaHash: string): Promise<Usuario> {
    return this.prisma.usuario.update({
      where: { id },
      data: {
        contrasena: contrasenaHash,
        resetToken: null,
        resetTokenExpira: null,
      },
    });
  }
}
