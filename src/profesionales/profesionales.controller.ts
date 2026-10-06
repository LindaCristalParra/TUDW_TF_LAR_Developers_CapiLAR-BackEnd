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
import { fechaCorta } from '../common/fecha-hora';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { ApiFoto } from '../fotos/api-foto.decorator';
import { Rol } from '../generated/prisma/client';
import { PublicUser } from '../users/users.service';
import { AsignarServicioDto } from './dto/asignar-servicio.dto';
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';
import { CreateDisponibilidadDto } from './dto/create-disponibilidad.dto';
import { DisponibilidadQueryDto } from './dto/disponibilidad-query.dto';
import { FechaQueryDto } from './dto/fecha-query.dto';
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
   * Incluye a los ADMIN con legajo que tengan algún servicio activo.
   * Público, no hace falta iniciar sesión.
   */
  @Get()
  @Public()
  findAll(@Query() query: ListProfesionalesQueryDto) {
    return this.profesionalesService.findAll(query.servicioId);
  }

  /**
   * Ver la foto de perfil de un profesional
   *
   * @remarks Devuelve la imagen. Cualquier usuario logueado. 404 si no tiene
   * foto (`tieneFoto` en `GET /profesionales`).
   */
  @Get(':legajo/foto')
  @ApiFoto()
  verFoto(@Param('legajo', ParseIdPipe) legajo: number) {
    return this.profesionalesService.verFoto(legajo);
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
   * Ver los horarios de trabajo de un profesional en un período
   *
   * @remarks Horarios por fecha entre `desde` y `hasta` (incluidas, máx. 31 días),
   * ordenados por fecha y hora. Cualquier usuario logueado.
   */
  @Get(':legajo/disponibilidad')
  async findDisponibilidad(
    @Param('legajo', ParseIdPipe) legajo: number,
    @Query() query: DisponibilidadQueryDto,
  ) {
    await this.profesionalesService.assertActivo(legajo);
    return this.profesionalesService.findDisponibilidad(
      legajo,
      query.desde,
      query.hasta,
    );
  }

  /**
   * Cargar un horario de trabajo en una o varias fechas (el propio profesional o ADMIN)
   *
   * @remarks El mismo horario en cada fecha de la lista (hasta 31). Se guardan
   * todas o ninguna. 400 si el inicio no es anterior al fin, si una fecha ya pasó
   * o está a más de 60 días, o si la jornada de una fecha supera las 12 horas;
   * 409 si se superpone con otro horario de esa fecha; 403 si un profesional
   * intenta cargar la agenda de otro.
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
   * Quitar todos los horarios de una fecha (el propio profesional o ADMIN)
   *
   * @remarks Borrado lógico. 409 si hay turnos reservados ese día; 400 si la
   * fecha ya pasó; 404 si no había horarios cargados.
   */
  @Delete(':legajo/disponibilidad')
  async deactivateDisponibilidadDeFecha(
    @Param('legajo', ParseIdPipe) legajo: number,
    @Query() query: FechaQueryDto,
    @Req() req: Request,
  ) {
    const cantidad =
      await this.profesionalesService.deactivateDisponibilidadDeFecha(
        legajo,
        query.fecha,
        req.user as PublicUser,
      );
    return {
      message: `Se ${cantidad === 1 ? 'quitó 1 horario' : `quitaron ${cantidad} horarios`} del ${fechaCorta(query.fecha)}`,
    };
  }

  /**
   * Quitar un horario de trabajo (el propio profesional o ADMIN)
   *
   * @remarks Borrado lógico. 409 si hay turnos reservados dentro de ese
   * horario; 400 si la fecha ya pasó.
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
