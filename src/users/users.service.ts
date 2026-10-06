import { Injectable } from '@nestjs/common';
import { Prisma, Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
