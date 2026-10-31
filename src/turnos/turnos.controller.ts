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
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import { PublicUser } from '../users/users.service';
import { AccionTurnoDto, CancelarPorTokenDto } from './dto/accion-turno.dto';
import { AgendaQueryDto } from './dto/agenda-query.dto';
import { CancelarTurnoDto } from './dto/cancelar-turno.dto';
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
   * otro. Tiene en cuenta la disponibilidad, los turnos tomados
   * y la anticipación (mín. 1 hora, máx. 60 días). Cualquier usuario logueado.
   * Un PROFESIONAL puede mandar `turnoId` al reprogramar (su horario actual
   * cuenta como libre) o `clienteId` al cargar un turno para un cliente; en los
   * dos casos se tienen en cuenta los otros turnos de ese cliente.
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
   * horario). PROFESIONAL: carga un turno para un cliente con `clienteId`
   * (queda CONFIRMADO). CLIENTE con `serieId`: reserva una fecha de su serie que
   * estaba ocupada, en otro horario de ese día (queda CONFIRMADO y en la serie).
   * 409 si el horario no está disponible.
   */
  @Post()
  @Roles(Rol.CLIENTE, Rol.PROFESIONAL)
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
   * alergias del cliente (`cliente.alergias` de la lista y `cliente.alergia`,
   * "Otra"). Solo lectura: con `legajo`, la de ese profesional;
   * sin `legajo`, la de todo el salón.
   */
  @Get('agenda')
  @Roles(Rol.PROFESIONAL, Rol.ADMIN)
  agenda(@Query() query: AgendaQueryDto) {
    return this.turnosService.agenda(query);
  }

  /**
   * Aceptar una solicitud (profesional del turno)
   *
   * @remarks PENDIENTE → CONFIRMADO. Le avisa al cliente por mail.
   */
  @Patch(':id/aceptar')
  @Roles(Rol.PROFESIONAL)
  aceptar(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    return this.turnosService.aceptar(id, req.user as PublicUser);
  }

  /**
   * Rechazar una solicitud (profesional del turno)
   *
   * @remarks PENDIENTE → RECHAZADO y el horario se libera. El motivo queda
   * guardado para el salón; el cliente recibe un mail amable, sin el motivo,
   * con los horarios alternativos ofrecidos (tienen que estar libres).
   */
  @Patch(':id/rechazar')
  @Roles(Rol.PROFESIONAL)
  rechazar(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: RechazarTurnoDto,
    @Req() req: Request,
  ) {
    return this.turnosService.rechazar(id, dto, req.user as PublicUser);
  }

  /**
   * Reprogramar un turno (profesional del turno)
   *
   * @remarks Cambia fecha, hora y, opcionalmente, los profesionales. Queda
   * REPROGRAMADO hasta que el cliente lo acepte; el horario nuevo queda ocupado.
   */
  @Patch(':id/reprogramar')
  @Roles(Rol.PROFESIONAL)
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

  /**
   * Cancelar un turno
   *
   * @remarks Pasa a CANCELADO y el horario se libera. CLIENTE: sus turnos
   * pendientes o reprogramados antes de que empiecen, y los confirmados hasta
   * 12 horas antes; el motivo es opcional y se avisa por mail a los
   * profesionales. Profesional del turno: en cualquier momento, con motivo
   * obligatorio; el cliente recibe un mail con el motivo.
   */
  @Patch(':id/cancelar')
  @Roles(Rol.CLIENTE, Rol.PROFESIONAL)
  cancelar(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CancelarTurnoDto,
    @Req() req: Request,
  ) {
    return this.turnosService.cancelar(id, dto, req.user as PublicUser);
  }

  /**
   * Marcar un turno como completado (profesional del turno)
   *
   * @remarks CONFIRMADO → COMPLETADO, a partir de la hora de inicio del turno.
   */
  @Patch(':id/completar')
  @Roles(Rol.PROFESIONAL)
  completar(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    return this.turnosService.completar(id, req.user as PublicUser);
  }

  /**
   * Ver el turno del enlace del recordatorio
   *
   * @remarks Público (sin login): el token viene en el enlace del mail
   * (`/turno/confirmar?token=` o `/turno/cancelar?token=`). Devuelve el turno y
   * `puedeCancelar` (siempre `true`: desde el recordatorio se puede cancelar
   * hasta que empiece). 400 si el enlace no es válido, el turno cambió de
   * horario, ya no está confirmado o ya empezó.
   */
  @Get('accion')
  @Public()
  verPorToken(@Query() dto: AccionTurnoDto) {
    return this.turnosService.verPorToken(dto.token);
  }

  /**
   * Confirmar asistencia desde el enlace del recordatorio
   *
   * @remarks Público, con el token del mail. Igual que confirmar desde la app:
   * guarda `asistenciaConfirmadaEn`; confirmar de nuevo no cambia nada.
   */
  @Post('accion/confirmar')
  @Public()
  @HttpCode(HttpStatus.OK)
  confirmarPorToken(@Body() dto: AccionTurnoDto) {
    return this.turnosService.confirmarPorToken(dto.token);
  }

  /**
   * Cancelar desde el enlace del recordatorio
   *
   * @remarks Público, con el token del mail. A diferencia de la app, no tiene el
   * límite de 12 horas: se puede cancelar hasta que empiece, así el horario se
   * libera. El motivo es opcional y se avisa por mail a los profesionales (si
   * faltaban menos de 12 horas, el mail lo marca).
   */
  @Post('accion/cancelar')
  @Public()
  @HttpCode(HttpStatus.OK)
  cancelarPorToken(@Body() dto: CancelarPorTokenDto) {
    return this.turnosService.cancelarPorToken(dto.token, dto.motivo || null);
  }

  /**
   * Confirmar asistencia (CLIENTE dueño del turno)
   *
   * @remarks Guarda `asistenciaConfirmadaEn` en un turno CONFIRMADO que todavía
   * no empezó. Confirmar de nuevo no cambia nada. Si el salón reprograma el
   * turno, la confirmación se borra.
   */
  @Patch(':id/confirmar-asistencia')
  @Roles(Rol.CLIENTE)
  confirmarAsistencia(
    @Param('id', ParseIdPipe) id: number,
    @Req() req: Request,
  ) {
    return this.turnosService.confirmarAsistencia(id, req.user as PublicUser);
  }

  /**
   * Marcar al cliente como ausente (profesional del turno)
   *
   * @remarks CONFIRMADO → AUSENTE, a partir de la hora de fin del turno. Sin mail.
   */
  @Patch(':id/ausente')
  @Roles(Rol.PROFESIONAL)
  marcarAusente(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    return this.turnosService.marcarAusente(id, req.user as PublicUser);
  }
}
