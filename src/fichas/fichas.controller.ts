import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateFichaDto } from './dto/create-ficha.dto';
import { FichaDto } from './dto/ficha.dto';
import { FichasService } from './fichas.service';

// Technical records (F08). Professionals only: the client never sees them.
// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('fichas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.PROFESIONAL)
@Controller()
export class FichasController {
  constructor(private readonly fichasService: FichasService) {}

  /**
   * Cargar la ficha técnica de un servicio del turno
   *
   * @remarks Solo el profesional de ese servicio (`turnoDetalleId`, de
   * `detalles[]` del turno), con el turno CONFIRMADO. Ningún campo es
   * obligatorio. 409 si ese servicio ya tiene ficha.
   */
  @Post('turnos/:id/fichas')
  create(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CreateFichaDto,
    @Req() req: Request,
  ) {
    return this.fichasService.create(id, dto, req.user as PublicUser);
  }

  /**
   * Historial de fichas de una clienta
   *
   * @remarks Todas sus fichas, de la más nueva a la más vieja, con fecha,
   * servicio y profesional. Cualquier PROFESIONAL del salón.
   */
  @Get('clientes/:id/fichas')
  findDelCliente(@Param('id', ParseIdPipe) id: number) {
    return this.fichasService.findDelCliente(id);
  }

  /** Ver una ficha (cualquier PROFESIONAL) */
  @Get('fichas/:id')
  findOne(@Param('id', ParseIdPipe) id: number) {
    return this.fichasService.findOne(id);
  }

  /**
   * Editar una ficha (el profesional de ese servicio)
   *
   * @remarks Solo mientras está abierta: se cierra cuando el turno se completa.
   * `null` (o `""` en los textos) borra un campo.
   */
  @Patch('fichas/:id')
  update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: FichaDto,
    @Req() req: Request,
  ) {
    return this.fichasService.update(id, dto, req.user as PublicUser);
  }

  /** Quitar una ficha (el profesional de ese servicio, mientras está abierta) */
  @Delete('fichas/:id')
  async deactivate(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    await this.fichasService.deactivate(id, req.user as PublicUser);
    return { message: 'Ficha quitada' };
  }
}
