import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
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
