import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { PublicUser } from '../users/users.service';
import { AuthService, Sesion } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerificarEmailDto } from './dto/verificar-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

const REFRESH_COOKIE = 'refreshToken';

const X_CLIENT = ApiHeader({
  name: 'X-Client',
  required: false,
  description:
    'Mandá `mobile` desde la app: el refresh token viaja en el body. Sin el header (web) viaja en una cookie httpOnly.',
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieSegura: boolean;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    // true when front and back are on different sites (deploy, HTTPS); false on localhost.
    this.cookieSegura = configService.get('COOKIE_SECURE') === 'true';
  }

  /**
   * Registrarse
   *
   * @remarks Crea una cuenta CLIENTE, inicia la sesión (igual que el login) y manda un
   * mail de bienvenida. 409 si el email ya está registrado (también si la cuenta está
   * dada de baja).
   */
  @Post('register')
  @X_CLIENT
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.entregar(await this.authService.register(dto), req, res);
  }

  /**
   * Iniciar sesión
   *
   * @remarks Devuelve el `accessToken` (dura 15 minutos) y el usuario. El refresh token
   * (7 días) va en una cookie httpOnly, o en el body (`refreshToken`) con
   * `X-Client: mobile`. Iniciar sesión cierra la sesión anterior (una por usuario).
   * 401 con el mismo mensaje si el email no existe, la contraseña es incorrecta o la
   * cuenta está dada de baja.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @X_CLIENT
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.entregar(await this.authService.login(dto), req, res);
  }

  /**
   * Renovar la sesión
   *
   * @remarks Cuando el `accessToken` vence (401), devuelve uno nuevo con el refresh token
   * de la cookie (web) o del body (`X-Client: mobile`). El refresh token se rota: el
   * viejo deja de servir y llega uno nuevo. Usar uno viejo cierra la sesión. 401 si no
   * hay sesión: hay que iniciar sesión de nuevo.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @X_CLIENT
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const sesion = await this.authService.refresh(this.refreshDe(dto, req));
      return this.entregar(sesion, req, res);
    } catch (error) {
      this.borrarCookie(res);
      throw error;
    }
  }

  /**
   * Cerrar sesión
   *
   * @remarks Invalida el refresh token (cookie o body con `X-Client: mobile`) y borra la
   * cookie. Responde 200 aunque la sesión ya no exista.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @X_CLIENT
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(this.refreshDe(dto, req));
    this.borrarCookie(res);
    return { message: 'Sesión cerrada' };
  }

  /**
   * Pedir recuperación de contraseña
   *
   * @remarks Si el email existe, manda un mail con un enlace que vence en 15 minutos.
   * Responde siempre lo mismo, exista o no el email.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return {
      message:
        'Si el email está registrado, vas a recibir las instrucciones para restablecer tu contraseña',
    };
  }

  /**
   * Restablecer la contraseña
   *
   * @remarks Usa el token del enlace del mail (un solo uso). 400 si es inválido, ya se
   * usó o venció.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Contraseña actualizada correctamente' };
  }

  /**
   * Verificar el email
   *
   * @remarks Usa el token del enlace del mail (`/verificar-email?token=...`), que dura
   * 7 días y sirve una sola vez. No hace falta iniciar sesión. 400 si es inválido, ya
   * se usó o venció (se pide otro con `POST /users/me/verificar-email`).
   */
  @Post('verificar-email')
  @HttpCode(HttpStatus.OK)
  async verificarEmail(@Body() dto: VerificarEmailDto) {
    await this.authService.verificarEmail(dto.token);
    return { message: 'Tu email quedó verificado' };
  }

  /**
   * Ver mi usuario
   *
   * @remarks Devuelve el usuario del token, con `cliente` (alergia) o `profesional` (legajo).
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@Req() req: Request) {
    return req.user;
  }

  /**
   * Cambiar mi contraseña
   *
   * @remarks Con la sesión iniciada, desde el perfil: `actual` y `nueva` (8 a 72
   * caracteres, con letra y número). Cierra la sesión en los otros dispositivos y
   * devuelve una sesión nueva (igual que el login: cookie o `refreshToken` con
   * `X-Client: mobile`). 400 si la actual no es correcta o la nueva es igual.
   */
  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @X_CLIENT
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as PublicUser;
    return this.entregar(
      await this.authService.changePassword(user.id, dto),
      req,
      res,
    );
  }

  // The app (React Native) can't use cookies: it sends X-Client: mobile and keeps the token itself.
  private esMobile(req: Request): boolean {
    return req.headers['x-client'] === 'mobile';
  }

  private refreshDe(dto: RefreshTokenDto, req: Request): string | undefined {
    return this.esMobile(req)
      ? dto.refreshToken
      : (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  }

  // The web never gets the refresh token in the body, so page scripts can't read it.
  private entregar(sesion: Sesion, req: Request, res: Response) {
    const { refreshToken, ...respuesta } = sesion;
    if (this.esMobile(req)) {
      return { ...respuesta, refreshToken };
    }
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.opcionesCookie(),
      maxAge: this.authService.refreshDias * 24 * 60 * 60 * 1000,
    });
    return respuesta;
  }

  private borrarCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.opcionesCookie());
  }

  // Only sent to /auth, where refresh and logout live.
  private opcionesCookie(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.cookieSegura,
      sameSite: this.cookieSegura ? 'none' : 'lax',
      path: '/auth',
    };
  }
}
