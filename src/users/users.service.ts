import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Rol, Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
    if (dto.alergia !== undefined && !user.cliente) {
      throw new BadRequestException('Solo los clientes pueden cargar alergias');
    }

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
            : { update: { alergia: dto.alergia || null } },
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
