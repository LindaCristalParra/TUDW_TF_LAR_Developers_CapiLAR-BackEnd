import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import { PublicUser } from '../users/users.service';
import { CreateSerieDto } from './dto/create-serie.dto';
import { MotivoSerieDto } from './dto/motivo-serie.dto';
import { SeriesService } from './series.service';

// F05: recurring turnos. The /** */ comments on each route are the Swagger summary and description.
@ApiTags('series')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  /**
   * Vista previa de una serie (PROFESIONAL)
   *
   * @remarks Repite un servicio tuyo de un turno CONFIRMADO o COMPLETADO, a la misma hora, con la
   * `frecuencia` elegida hasta `fechaFin` (máx. 60 días desde hoy). No crea nada:
   * devuelve cada fecha como `LIBRE`, `SIN_HORARIO` (no cargaste tu horario ese día;
   * el turno se crea igual) u `OCUPADA` (no se crea; trae `horariosLibres` de ese día
   * para la clienta). 409 si el turno ya es parte de una serie.
   */
  @Post('vista-previa')
  @HttpCode(HttpStatus.OK)
  @Roles(Rol.PROFESIONAL)
  vistaPrevia(@Body() dto: CreateSerieDto, @Req() req: Request) {
    return this.seriesService.vistaPrevia(dto, req.user as PublicUser);
  }

  /**
   * Crear una serie (PROFESIONAL)
   *
   * @remarks Mismo body que la vista previa. Crea la serie ACTIVA y un turno
   * CONFIRMADO en cada fecha `LIBRE` o `SIN_HORARIO` (`turnoId` de cada fecha). A la
   * clienta le llega un mail con todas las fechas y, en las `OCUPADA`, los horarios
   * libres de ese día para que reserve otro desde la app. Si hay fechas
   * `SIN_HORARIO`, te llega un mail para que cargues tu horario.
   */
  @Post()
  @Roles(Rol.PROFESIONAL)
  create(@Body() dto: CreateSerieDto, @Req() req: Request) {
    return this.seriesService.create(dto, req.user as PublicUser);
  }

  /**
   * Ver series
   *
   * @remarks PROFESIONAL: las que gestiona. CLIENTE: las suyas (solo lectura). Más
   * nuevas primero, con cada fecha y su turno (`null` si esa fecha no tiene turno:
   * estaba ocupada o la serie está suspendida).
   */
  @Get()
  @Roles(Rol.PROFESIONAL, Rol.CLIENTE)
  findAll(@Req() req: Request) {
    return this.seriesService.findAll(req.user as PublicUser);
  }

  /** Ver una serie (PROFESIONAL o CLIENTE, solo las propias) */
  @Get(':id')
  @Roles(Rol.PROFESIONAL, Rol.CLIENTE)
  findOne(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    return this.seriesService.findOne(id, req.user as PublicUser);
  }

  /**
   * Suspender una serie (PROFESIONAL)
   *
   * @remarks Solo ACTIVA. Cancela los turnos de la serie que todavía no empezaron
   * (con el `motivo`, opcional) y le avisa a la clienta. Se puede reactivar.
   */
  @Patch(':id/suspender')
  @Roles(Rol.PROFESIONAL)
  suspender(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: MotivoSerieDto,
    @Req() req: Request,
  ) {
    return this.seriesService.suspender(id, dto, req.user as PublicUser);
  }

  /**
   * Reactivar una serie (PROFESIONAL)
   *
   * @remarks Solo SUSPENDIDA. Vuelve a reservar, con las mismas reglas que al
   * crearla, las fechas por delante que no tienen turno (las que la clienta canceló
   * no se vuelven a ofrecer). Le llega el mail con las fechas a la clienta.
   */
  @Patch(':id/reactivar')
  @Roles(Rol.PROFESIONAL)
  reactivar(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    return this.seriesService.reactivar(id, req.user as PublicUser);
  }

  /**
   * Dar de baja una serie (PROFESIONAL)
   *
   * @remarks ACTIVA o SUSPENDIDA, sin vuelta atrás. Cancela los turnos de la serie
   * que todavía no empezaron (con el `motivo`, opcional) y le avisa a la clienta.
   */
  @Patch(':id/baja')
  @Roles(Rol.PROFESIONAL)
  baja(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: MotivoSerieDto,
    @Req() req: Request,
  ) {
    return this.seriesService.baja(id, dto, req.user as PublicUser);
  }
}
