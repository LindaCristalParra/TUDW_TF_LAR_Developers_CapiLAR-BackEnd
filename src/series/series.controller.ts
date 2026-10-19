import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Rol } from '../generated/prisma/client';
import { PublicUser } from '../users/users.service';
import { CreateSerieDto } from './dto/create-serie.dto';
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
   * @remarks Repite un servicio tuyo de un turno CONFIRMADO, a la misma hora, con la
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
}
