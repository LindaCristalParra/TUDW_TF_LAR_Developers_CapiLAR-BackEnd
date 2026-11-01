import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import type { PublicUser } from '../users/users.service';
import { CreateMovimientoDto } from './dto/create-movimiento.dto';
import { MovimientosService } from './movimientos.service';

// Stock movements of an item. ADMIN loads items, but both roles move stock (decided 31/10).
@ApiTags('articulos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN, Rol.PROFESIONAL)
@Controller('articulos')
export class MovimientosController {
  constructor(private readonly movimientosService: MovimientosService) {}

  /**
   * Registrar un movimiento de stock (ADMIN o PROFESIONAL)
   *
   * @remarks `cantidad` va en envases. INGRESO suma, EGRESO resta y AJUSTE deja
   * el stock en lo contado (se guarda la diferencia con signo, también si da 0).
   * `motivo` es obligatorio en EGRESO y AJUSTE. Un EGRESO puede dejar el stock
   * negativo: se registra igual y `stockNegativo` viene en `true`. Responde
   * `{ movimiento, articulo, stockNegativo }`, con el artículo actualizado.
   * 404 si el artículo no existe o está dado de baja; 400 si el stock pasaría
   * los 9.999.999,999 envases.
   */
  @Post(':id/movimientos')
  create(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CreateMovimientoDto,
    @Req() req: Request,
  ) {
    return this.movimientosService.create(id, dto, (req.user as PublicUser).id);
  }
}
