import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { ApiFoto } from '../fotos/api-foto.decorator';
import type { ArchivoSubido } from '../fotos/fotos.service';
import { SubirFotoInterceptor } from '../fotos/subir-foto.interceptor';
import { Rol } from '../generated/prisma/client';
import { CreateServicioDto } from './dto/create-servicio.dto';
import { UpdateServicioDto } from './dto/update-servicio.dto';
import { ServiciosService } from './servicios.service';

// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('servicios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('servicios')
export class ServiciosController {
  constructor(private readonly serviciosService: ServiciosService) {}

  /**
   * Listar los servicios que ofrece el salón
   *
   * @remarks Público, no hace falta iniciar sesión. Solo los activos.
   * `precio` llega como texto con 2 decimales (ej. "15000.00").
   */
  @Get()
  @Public()
  findAll() {
    return this.serviciosService.findAll();
  }

  /**
   * Listar todos los servicios, incluidos los dados de baja (solo ADMIN)
   *
   * @remarks Para ver los dados de baja y reactivarlos con `PATCH /servicios/:id/alta`.
   */
  @Get('todos')
  @Roles(Rol.ADMIN)
  findTodos() {
    return this.serviciosService.findAll(true);
  }

  /** Crear un servicio (solo ADMIN) */
  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateServicioDto) {
    return this.serviciosService.create(dto);
  }

  /**
   * Modificar un servicio (solo ADMIN)
   *
   * @remarks Se actualizan solo los campos enviados. Los turnos ya reservados
   * conservan el precio con el que se reservaron. 404 si no existe o está dado de baja.
   */
  @Patch(':id')
  @Roles(Rol.ADMIN)
  update(@Param('id', ParseIdPipe) id: number, @Body() dto: UpdateServicioDto) {
    return this.serviciosService.update(id, dto);
  }

  /**
   * Ver la foto de un servicio
   *
   * @remarks Devuelve la imagen. Público, se puede usar directo en un `<img>`.
   * 404 si no tiene foto.
   */
  @Get(':id/foto')
  @Public()
  @ApiFoto()
  verFoto(@Param('id', ParseIdPipe) id: number) {
    return this.serviciosService.verFoto(id);
  }

  /**
   * Subir o cambiar la foto de un servicio (solo ADMIN)
   *
   * @remarks `multipart/form-data` con la imagen en el campo `foto`: JPG, PNG o
   * WEBP de hasta 2 MB. Reemplaza la anterior. 404 si el servicio no existe o
   * está dado de baja.
   */
  @Patch(':id/foto')
  @Roles(Rol.ADMIN)
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
    @Param('id', ParseIdPipe) id: number,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.serviciosService.cambiarFoto(id, archivo);
  }

  /** Quitar la foto de un servicio (solo ADMIN) */
  @Delete(':id/foto')
  @Roles(Rol.ADMIN)
  quitarFoto(@Param('id', ParseIdPipe) id: number) {
    return this.serviciosService.quitarFoto(id);
  }

  /**
   * Dar de alta un servicio dado de baja (solo ADMIN)
   *
   * @remarks 404 si no existe; 400 si ya está activo.
   */
  @Patch(':id/alta')
  @Roles(Rol.ADMIN)
  reactivate(@Param('id', ParseIdPipe) id: number) {
    return this.serviciosService.reactivate(id);
  }

  /**
   * Dar de baja un servicio (solo ADMIN)
   *
   * @remarks Borrado lógico: deja de ofrecerse, pero los turnos que ya lo usan
   * lo siguen mostrando. 404 si no existe o ya estaba dado de baja.
   */
  @Delete(':id')
  @Roles(Rol.ADMIN)
  async deactivate(@Param('id', ParseIdPipe) id: number) {
    await this.serviciosService.deactivate(id);
    return { message: 'Servicio dado de baja' };
  }
}
