import {
  Body,
  Controller,
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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PaginacionQueryDto } from '../common/paginacion';
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

  /**
   * Historial de stock de un artículo (ADMIN o PROFESIONAL)
   *
   * @remarks Del más nuevo al más viejo, por páginas: `{ items, total, pagina,
   * porPagina }` (por defecto 50 por página, máximo 200). Cada item tiene el
   * mismo formato que `movimiento` del POST: `cantidad` con signo (lo que cambió
   * el stock), `tipo`, `motivo`, `numComprobante` y quién lo registró
   * (`usuario`). El stock inicial del alta es un INGRESO "Stock inicial". Lo
   * que usa una ficha técnica es un CONSUMO "Ficha N" (al completar el turno, y
   * sus correcciones al editarla cerrada); no se registra a mano.
   * También de un artículo dado de baja; 404 si no existe. Una página después
   * de la última trae `items` vacío.
   */
  @Get(':id/movimientos')
  findDeArticulo(
    @Param('id', ParseIdPipe) id: number,
    @Query() query: PaginacionQueryDto,
  ) {
    return this.movimientosService.findDeArticulo(id, query);
  }
}
