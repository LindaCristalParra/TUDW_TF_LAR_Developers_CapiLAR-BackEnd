import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { VerificacionEmailService } from '../users/verificacion-email.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './jwt-payload.interface';

const BCRYPT_SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

// SHA-256 (not bcrypt): deterministic, so the user can be looked up by the hash.
// Used for the reset token and the refresh token.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

/** AuthResponse plus the refresh token: the controller sends it as a cookie (web) or in the body (app). */
export interface Sesion extends AuthResponse {
  refreshToken: string;
}

interface RefreshPayload {
  sub: number;
  // Session id: created at login, kept when the token rotates.
  sid: string;
  // Random, so two tokens issued in the same second are still different.
  jti: string;
}

// Usuario.refreshToken holds "<sid>:<sha256 of the token>".
function guardado(sid: string, token: string): string {
  return `${sid}:${hashToken(token)}`;
}

const SESION_VENCIDA = 'Tu sesión venció. Iniciá sesión de nuevo.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Own secret: a refresh token can't be used as an access token (and the other way around).
  private readonly refreshSecret: string;
  readonly refreshDias: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly verificacionEmail: VerificacionEmailService,
    configService: ConfigService,
  ) {
    this.refreshSecret = configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.refreshDias = Number(configService.get('REFRESH_EXPIRES_DAYS') ?? 7);
  }

  async register(dto: RegisterDto): Promise<Sesion> {
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
    // must not delay or break the sign-up response. It carries the verification link.
    const tokenVerificacion = await this.verificacionEmail.nuevoToken(user.id);
    this.mailService
      .sendWelcome(user.email, user.nombre, tokenVerificacion)
      .catch((error) => {
        this.logger.error(
          `Could not send welcome email to ${user.email}`,
          error instanceof Error ? error.stack : String(error),
        );
      });

    return this.crearSesion(user);
  }

  async login(dto: LoginDto): Promise<Sesion> {
    const user = await this.usersService.findByEmail(dto.email.toLowerCase());
    const isValid =
      user !== null &&
      user.fechaBaja === null &&
      (await bcrypt.compare(dto.contrasena, user.contrasena));

    if (!isValid) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }

    return this.crearSesion(user);
  }

  // Rotation: every refresh token works once and is replaced by a new one.
  async refresh(token: string | undefined): Promise<Sesion> {
    const payload = await this.verificarRefresh(token);
    const user = payload && (await this.usersService.findById(payload.sub));
    if (!user || user.fechaBaja !== null) {
      throw new UnauthorizedException(SESION_VENCIDA);
    }
    if (user.refreshToken !== guardado(payload.sid, token!)) {
      // An old token of the current session was used again: someone may have a copy, so
      // the session ends. A token of an older session (replaced by a new login) just fails.
      if (user.refreshToken?.startsWith(`${payload.sid}:`)) {
        this.logger.warn(`Reused refresh token for user ${user.id}`);
        await this.usersService.setRefreshToken(user.id, null);
      }
      throw new UnauthorizedException(SESION_VENCIDA);
    }
    return this.crearSesion(user, payload.sid);
  }

  // Always succeeds: an invalid or old token just has nothing to close.
  async logout(token: string | undefined): Promise<void> {
    const payload = await this.verificarRefresh(token);
    if (!payload) {
      return;
    }
    const user = await this.usersService.findById(payload.sub);
    if (user && user.refreshToken === guardado(payload.sid, token!)) {
      await this.usersService.setRefreshToken(user.id, null);
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    // Silent return: the response must not reveal whether the email exists.
    if (!user || user.fechaBaja !== null) {
      return;
    }

    const token = randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.usersService.setResetToken(user.id, hashToken(token), expira);

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
    const user = await this.usersService.findByResetToken(hashToken(dto.token));
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

  verificarEmail(token: string): Promise<void> {
    return this.verificacionEmail.verificar(token);
  }

  // Logged in. Closes the session on other devices and starts a new one here,
  // so whoever changes it doesn't have to log in again.
  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
  ): Promise<Sesion> {
    const user = await this.usersService.findById(userId);
    if (!user || user.fechaBaja !== null) {
      throw new UnauthorizedException(SESION_VENCIDA);
    }
    if (!(await bcrypt.compare(dto.actual, user.contrasena))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (dto.nueva === dto.actual) {
      throw new BadRequestException(
        'La contraseña nueva tiene que ser distinta de la actual',
      );
    }

    await this.usersService.updatePassword(
      user.id,
      await bcrypt.hash(dto.nueva, BCRYPT_SALT_ROUNDS),
    );
    return this.crearSesion(user);
  }

  // New access + refresh token. Saving it replaces the previous one (one session per user).
  // Without sid it's a new login; with it, a rotation of that session.
  private async crearSesion(
    user: UsuarioConPerfil,
    sid = randomBytes(16).toString('hex'),
  ): Promise<Sesion> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
    };
    const refreshPayload: RefreshPayload = {
      sub: user.id,
      sid,
      jti: randomBytes(16).toString('hex'),
    };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: `${this.refreshDias}d`,
    });
    await this.usersService.setRefreshToken(
      user.id,
      guardado(sid, refreshToken),
    );
    return {
      accessToken: await this.jwtService.signAsync(payload),
      refreshToken,
      user: this.usersService.toPublic(user),
    };
  }

  // null when the token is missing, malformed, expired or not signed by us.
  private async verificarRefresh(
    token: string | undefined,
  ): Promise<RefreshPayload | null> {
    if (!token) {
      return null;
    }
    try {
      return await this.jwtService.verifyAsync<RefreshPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      return null;
    }
  }
}
