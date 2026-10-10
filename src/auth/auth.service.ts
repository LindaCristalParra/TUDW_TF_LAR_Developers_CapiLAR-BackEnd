import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Rol } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import {
  PublicUser,
  UsersService,
  UsuarioConPerfil,
} from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './jwt-payload.interface';

const BCRYPT_SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

// SHA-256 (not bcrypt): deterministic, so the user can be looked up by the hash.
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase();
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('El email ya está registrado');
    }

    const user = await this.usersService.create({
      nombre: dto.nombre,
      apellido: dto.apellido,
      email,
      telefono: dto.telefono,
      fechaNacimiento: dto.fechaNacimiento
        ? this.usersService.fechaNacimientoADate(dto.fechaNacimiento)
        : undefined,
      contrasena: await bcrypt.hash(dto.contrasena, BCRYPT_SALT_ROUNDS),
      // Public sign-up only creates clients; staff accounts are created by an admin.
      rol: Rol.CLIENTE,
      cliente: { create: { alergia: dto.alergia } },
    });

    // Not awaited: the account already exists, so a slow or failed email
    // must not delay or break the sign-up response.
    this.mailService.sendWelcome(user.email, user.nombre).catch((error) => {
      this.logger.error(
        `Could not send welcome email to ${user.email}`,
        error instanceof Error ? error.stack : String(error),
      );
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email.toLowerCase());
    const isValid =
      user !== null &&
      user.fechaBaja === null &&
      (await bcrypt.compare(dto.contrasena, user.contrasena));

    if (!isValid) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }

    return this.buildAuthResponse(user);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    // Silent return: the response must not reveal whether the email exists.
    if (!user || user.fechaBaja !== null) {
      return;
    }

    const token = randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.usersService.setResetToken(
      user.id,
      hashResetToken(token),
      expira,
    );

    // A failure must not change the response, or it would reveal that the email exists.
    try {
      await this.mailService.sendPasswordReset(user.email, user.nombre, token);
    } catch (error) {
      this.logger.error(
        `Could not send password reset email to ${user.email}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.usersService.findByResetToken(
      hashResetToken(dto.token),
    );
    const isValid =
      user !== null &&
      user.fechaBaja === null &&
      user.resetTokenExpira !== null &&
      user.resetTokenExpira > new Date();

    if (!isValid) {
      throw new BadRequestException(
        'El enlace para restablecer la contraseña no es válido o ya venció',
      );
    }

    await this.usersService.updatePassword(
      user.id,
      await bcrypt.hash(dto.contrasena, BCRYPT_SALT_ROUNDS),
    );
  }

  private async buildAuthResponse(
    user: UsuarioConPerfil,
  ): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: this.usersService.toPublic(user),
    };
  }
}
