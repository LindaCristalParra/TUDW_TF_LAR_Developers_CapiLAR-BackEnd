import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { ApiFoto } from '../fotos/api-foto.decorator';
import type { ArchivoSubido } from '../fotos/fotos.service';
import { SubirFotoInterceptor } from '../fotos/subir-foto.interceptor';
import { Rol } from '../generated/prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListClientesQueryDto } from './dto/list-clientes-query.dto';
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
   * Buscar clientes (PROFESIONAL)
   *
   * @remarks Para elegir el cliente al cargar un turno a su nombre. Solo clientes
   * activos, ordenados por apellido y nombre, con `id`, `nombre`, `apellido`,
   * `email`, `telefono` y `cliente.alergia`.
   */
  @Get('clientes')
  @Roles(Rol.PROFESIONAL)
  findClientes(@Query() query: ListClientesQueryDto) {
    return this.usersService.findClientes(query.search);
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
   * Subir o cambiar mi foto de perfil
   *
   * @remarks `multipart/form-data` con la imagen en el campo `foto`: JPG, PNG o
   * WEBP de hasta 2 MB (el tipo se controla por el contenido, no por el nombre).
   * La de un CLIENTE va a su perfil de cliente; la de un PROFESIONAL, a su
   * perfil de profesional. Reemplaza la anterior. 400 si falta, no es una imagen
   * válida, pesa más de 2 MB o quien la sube es un ADMIN.
   */
  // Declared before ':id' routes so "me" is not parsed as an id.
  @Patch('me/foto')
  @UseInterceptors(SubirFotoInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['foto'],
      properties: { foto: { type: 'string', format: 'binary' } },
    },
  })
  cambiarFoto(
    @Req() req: Request,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.usersService.cambiarFoto(req.user as PublicUser, archivo);
  }

  /**
   * Quitar mi foto de perfil
   *
   * @remarks 404 si no tenía foto.
   */
  @Delete('me/foto')
  quitarFoto(@Req() req: Request) {
    return this.usersService.quitarFoto(req.user as PublicUser);
  }

  /**
   * Ver la foto de perfil de un usuario
   *
   * @remarks Devuelve la imagen. El propio usuario ve la suya; PROFESIONAL y
   * ADMIN ven la de cualquiera (por ejemplo, la de un cliente). Para la de un
   * profesional por legajo está `GET /profesionales/:legajo/foto`. 404 si no
   * tiene foto o si un CLIENTE pide la de otro usuario.
   */
  @Get(':id/foto')
  @ApiFoto()
  verFoto(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    return this.usersService.verFoto(id, req.user as PublicUser);
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
