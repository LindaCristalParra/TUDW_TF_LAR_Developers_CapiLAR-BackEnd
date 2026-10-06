import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registrarse
   *
   * @remarks Crea una cuenta CLIENTE, devuelve el token y manda un mail de bienvenida.
   * 409 si el email ya está registrado (también si la cuenta está dada de baja).
   */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Iniciar sesión
   *
   * @remarks Devuelve el token (`accessToken`) y el usuario. 401 con el mismo mensaje
   * si el email no existe, la contraseña es incorrecta o la cuenta está dada de baja.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
}
