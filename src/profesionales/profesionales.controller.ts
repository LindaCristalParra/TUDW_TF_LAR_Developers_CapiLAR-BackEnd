import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import { PublicUser } from '../users/users.service';
import { AsignarServicioDto } from './dto/asignar-servicio.dto';
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';
import { CreateDisponibilidadDto } from './dto/create-disponibilidad.dto';
import { ListProfesionalesQueryDto } from './dto/list-profesionales-query.dto';
import { ProfesionalesService } from './profesionales.service';

// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('profesionales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('profesionales')
export class ProfesionalesController {
  constructor(private readonly profesionalesService: ProfesionalesService) {}

  /**
   * Listar profesionales
   *
   * @remarks Profesionales activos (legajo, nombre y apellido), para elegir con
   * quién reservar. `?servicioId=` muestra solo los que hacen ese servicio.
   * Público, no hace falta iniciar sesión.
   */
  @Get()
  @Public()
  findAll(@Query() query: ListProfesionalesQueryDto) {
    return this.profesionalesService.findAll(query.servicioId);
  }

  /**
   * Ver los servicios que hace un profesional
   *
   * @remarks Solo los servicios activos. Cualquier usuario logueado.
   */
  @Get(':legajo/servicios')
  async findServicios(@Param('legajo', ParseIdPipe) legajo: number) {
    await this.profesionalesService.assertActivo(legajo);
    return this.profesionalesService.findServicios(legajo);
  }

  /**
   * Asignar un servicio a un profesional (solo ADMIN)
   *
   * @remarks 404 si el profesional o el servicio no existen o están dados de baja;
   * 409 si ya lo tiene.
   */
  @Post(':legajo/servicios')
  @Roles(Rol.ADMIN)
  asignarServicio(
    @Param('legajo', ParseIdPipe) legajo: number,
    @Body() dto: AsignarServicioDto,
  ) {
    return this.profesionalesService.asignarServicio(legajo, dto.servicioId);
  }

  /**
   * Quitar un servicio a un profesional (solo ADMIN)
   *
   * @remarks Borrado lógico. Los turnos ya reservados con ese servicio no se
   * tocan; solo deja de poder reservarse con este profesional.
   */
  @Delete(':legajo/servicios/:servicioId')
  @Roles(Rol.ADMIN)
  async quitarServicio(
    @Param('legajo', ParseIdPipe) legajo: number,
    @Param('servicioId', ParseIdPipe) servicioId: number,
  ) {
    await this.profesionalesService.quitarServicio(legajo, servicioId);
    return { message: 'Servicio quitado' };
  }

  /**
   * Ver la disponibilidad semanal de un profesional
   *
   * @remarks Horarios de trabajo por día (0 = domingo ... 6 = sábado). Cualquier usuario logueado.
   */
  @Get(':legajo/disponibilidad')
  async findDisponibilidad(@Param('legajo', ParseIdPipe) legajo: number) {
    await this.profesionalesService.assertActivo(legajo);
    return this.profesionalesService.findDisponibilidad(legajo);
  }

  /**
   * Cargar un horario de trabajo (el propio profesional o ADMIN)
   *
   * @remarks 400 si el inicio no es anterior al fin o si la jornada de ese día
   * supera las 12 horas; 409 si se superpone con otro horario del mismo día;
   * 403 si un profesional intenta cargar la agenda de otro.
   */
  @Post(':legajo/disponibilidad')
  createDisponibilidad(
    @Param('legajo', ParseIdPipe) legajo: number,
    @Body() dto: CreateDisponibilidadDto,
    @Req() req: Request,
  ) {
    return this.profesionalesService.createDisponibilidad(
      legajo,
      dto,
      req.user as PublicUser,
    );
  }

  /**
   * Quitar un horario de trabajo (el propio profesional o ADMIN)
   *
   * @remarks Borrado lógico. Los turnos ya reservados no se tocan.
   */
  @Delete(':legajo/disponibilidad/:id')
  async deactivateDisponibilidad(
    @Param('legajo', ParseIdPipe) legajo: number,
    @Param('id', ParseIdPipe) id: number,
    @Req() req: Request,
  ) {
    await this.profesionalesService.deactivateDisponibilidad(
      legajo,
      id,
      req.user as PublicUser,
    );
    return { message: 'Horario quitado' };
  }

  /**
   * Ver los bloqueos de agenda de un profesional
   *
   * @remarks Los que todavía no terminaron. Cualquier usuario logueado.
   */
  @Get(':legajo/bloqueos')
  async findBloqueos(@Param('legajo', ParseIdPipe) legajo: number) {
    await this.profesionalesService.assertActivo(legajo);
    return this.profesionalesService.findBloqueos(legajo);
  }

  /**
   * Bloquear la agenda (el propio profesional o ADMIN)
   *
   * @remarks Vacaciones, trámites, etc. Fechas en hora local del salón
   * (`YYYY-MM-DDTHH:mm`). 409 si hay turnos reservados en ese período.
   */
  @Post(':legajo/bloqueos')
  createBloqueo(
    @Param('legajo', ParseIdPipe) legajo: number,
    @Body() dto: CreateBloqueoDto,
    @Req() req: Request,
  ) {
    return this.profesionalesService.createBloqueo(
      legajo,
      dto,
      req.user as PublicUser,
    );
  }

  /** Quitar un bloqueo de agenda (el propio profesional o ADMIN) */
  @Delete(':legajo/bloqueos/:id')
  async deactivateBloqueo(
    @Param('legajo', ParseIdPipe) legajo: number,
    @Param('id', ParseIdPipe) id: number,
    @Req() req: Request,
  ) {
    await this.profesionalesService.deactivateBloqueo(
      legajo,
      id,
      req.user as PublicUser,
    );
    return { message: 'Bloqueo quitado' };
  }
}
