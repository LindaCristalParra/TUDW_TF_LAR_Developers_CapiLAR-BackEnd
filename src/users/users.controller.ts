import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { PublicUser, UsersService } from './users.service';

// The /** */ comments on each route are the Swagger summary and description
// (introspectComments in nest-cli.json).
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Listar usuarios (solo ADMIN)
   *
   * @remarks Por defecto devuelve solo los activos, ordenados por apellido y nombre.
   * 403 si quien llama no es ADMIN.
   */
  @Get()
  @Roles(Rol.ADMIN)
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  /**
   * Editar mi perfil
   *
   * @remarks Se actualizan solo los campos enviados. 409 si el email ya lo usa otra
   * cuenta; 400 si alguien que no es CLIENTE manda `alergia`.
   */
  @Patch('me')
  updateMe(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user as PublicUser, dto);
  }

  /**
   * Darme de baja
   *
   * @remarks Borrado lógico: completa `fechaBaja`, la cuenta no puede volver a iniciar
   * sesión y el token actual deja de funcionar. 403 si quien llama es ADMIN.
   */
  // Declared before ':id' so "me" is not parsed as an id.
  @Delete('me')
  async deactivateMe(@Req() req: Request) {
    const user = req.user as PublicUser;
    await this.usersService.deactivate(user.id, user);
    return { message: 'Tu cuenta fue dada de baja' };
  }

  /**
   * Cambiar el rol de un usuario (solo ADMIN)
   *
   * @remarks Si el rol nuevo es PROFESIONAL se le asigna un legajo automático (o
   * conserva el que ya tenía). 403 si el ADMIN intenta cambiar su propio rol;
   * 404 si el usuario no existe o está dado de baja; 400 si ya tiene ese rol.
   */
  @Patch(':id/rol')
  @Roles(Rol.ADMIN)
  changeRol(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateRolDto,
    @Req() req: Request,
  ) {
    return this.usersService.changeRol(id, dto.rol, req.user as PublicUser);
  }

  /**
   * Dar de alta a un usuario dado de baja (solo ADMIN)
   *
   * @remarks Vuelve `fechaBaja` a `null`: la cuenta puede iniciar sesión otra
   * vez, con la misma contraseña y el mismo rol. Devuelve el usuario.
   * 404 si no existe; 400 si ya está activo.
   */
  @Patch(':id/alta')
  @Roles(Rol.ADMIN)
  reactivate(@Param('id', ParseIdPipe) id: number) {
    return this.usersService.reactivate(id);
  }

  /**
   * Dar de baja a un usuario (solo ADMIN)
   *
   * @remarks Borrado lógico, igual que `DELETE /users/me`. 403 si el ADMIN intenta
   * darse de baja a sí mismo; 404 si no existe o ya estaba dado de baja.
   */
  @Delete(':id')
  @Roles(Rol.ADMIN)
  async deactivate(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    await this.usersService.deactivate(id, req.user as PublicUser);
    return { message: 'Usuario dado de baja' };
  }
}
