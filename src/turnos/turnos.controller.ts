import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import { AgendaQueryDto } from './dto/agenda-query.dto';
import { CreateTurnoDto } from './dto/create-turno.dto';
import { HorariosLibresDto } from './dto/horarios-libres.dto';
import { RechazarTurnoDto } from './dto/rechazar-turno.dto';
import { ReprogramarTurnoDto } from './dto/reprogramar-turno.dto';
import { TurnosService } from './turnos.service';

// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('turnos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('turnos')
export class TurnosController {
  constructor(private readonly turnosService: TurnosService) {}

  /**
   * Consultar horarios libres
   *
   * @remarks Horas de inicio posibles (cada 15 minutos) para una fecha y una
   * lista de servicios, cada uno con su profesional, hechos uno después del
   * otro. Tiene en cuenta la disponibilidad, los bloqueos, los turnos tomados
   * y la anticipación (mín. 1 hora, máx. 60 días). Cualquier usuario logueado.
   */
  @Post('horarios-libres')
  @HttpCode(HttpStatus.OK)
  horariosLibres(@Body() dto: HorariosLibresDto, @Req() req: Request) {
    return this.turnosService.horariosLibres(dto, req.user as PublicUser);
  }

  /**
   * Pedir o cargar un turno
   *
   * @remarks CLIENTE: solicita un turno para sí (queda PENDIENTE y ocupa el
   * horario). PROFESIONAL o ADMIN: cargan un turno para un cliente con
   * `clienteId` (queda CONFIRMADO). 409 si el horario no está disponible.
   */
  @Post()
  create(@Body() dto: CreateTurnoDto, @Req() req: Request) {
    return this.turnosService.create(dto, req.user as PublicUser);
  }

  /** Mis turnos (CLIENTE) */
  @Get('mios')
  @Roles(Rol.CLIENTE)
  findMios(@Req() req: Request) {
    return this.turnosService.findMios(req.user as PublicUser);
  }

  /**
   * Agenda (PROFESIONAL o ADMIN)
   *
   * @remarks Turnos entre dos fechas (máx. 31 días), con nombre, teléfono y
   * alergia del cliente. El PROFESIONAL ve la suya; el ADMIN la de un
   * profesional (`legajo`) o la de todos.
   */
  @Get('agenda')
  @Roles(Rol.PROFESIONAL, Rol.ADMIN)
  agenda(@Query() query: AgendaQueryDto, @Req() req: Request) {
    return this.turnosService.agenda(query, req.user as PublicUser);
  }

  /**
   * Aceptar una solicitud (profesional del turno o ADMIN)
   *
   * @remarks PENDIENTE → CONFIRMADO. Le avisa al cliente por mail.
   */
  @Patch(':id/aceptar')
  @Roles(Rol.PROFESIONAL, Rol.ADMIN)
  aceptar(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    return this.turnosService.aceptar(id, req.user as PublicUser);
  }

  /**
   * Rechazar una solicitud (profesional del turno o ADMIN)
   *
   * @remarks PENDIENTE → RECHAZADO y el horario se libera. El motivo queda
   * guardado para el salón; el cliente recibe un mail amable, sin el motivo,
   * con los horarios alternativos ofrecidos (tienen que estar libres).
   */
  @Patch(':id/rechazar')
  @Roles(Rol.PROFESIONAL, Rol.ADMIN)
  rechazar(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: RechazarTurnoDto,
    @Req() req: Request,
  ) {
    return this.turnosService.rechazar(id, dto, req.user as PublicUser);
  }

  /**
   * Reprogramar un turno (profesional del turno o ADMIN)
   *
   * @remarks Cambia fecha, hora y, opcionalmente, los profesionales. Queda
   * REPROGRAMADO hasta que el cliente lo acepte; el horario nuevo queda ocupado.
   */
  @Patch(':id/reprogramar')
  @Roles(Rol.PROFESIONAL, Rol.ADMIN)
  reprogramar(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: ReprogramarTurnoDto,
    @Req() req: Request,
  ) {
    return this.turnosService.reprogramar(id, dto, req.user as PublicUser);
  }

  /**
   * Aceptar el nuevo horario (CLIENTE dueño del turno)
   *
   * @remarks REPROGRAMADO → CONFIRMADO.
   */
  @Patch(':id/aceptar-reprogramacion')
  @Roles(Rol.CLIENTE)
  aceptarReprogramacion(
    @Param('id', ParseIdPipe) id: number,
    @Req() req: Request,
  ) {
    return this.turnosService.aceptarReprogramacion(id, req.user as PublicUser);
  }
}
