import { Injectable } from '@nestjs/common';
import { Prisma, Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PublicUser = Omit<
  Usuario,
  'contrasena' | 'resetToken' | 'resetTokenExpira'
>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UsuarioCreateInput): Promise<Usuario> {
    return this.prisma.usuario.create({ data });
  }

  findByEmail(email: string): Promise<Usuario | null> {
    return this.prisma.usuario.findUnique({ where: { email } });
  }

  findById(id: number): Promise<Usuario | null> {
    return this.prisma.usuario.findUnique({ where: { id } });
  }

  toPublic(user: Usuario): PublicUser {
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
