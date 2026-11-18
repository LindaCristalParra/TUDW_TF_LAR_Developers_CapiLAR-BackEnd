import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import type { PublicUser } from '../users/users.service';
import { ComprasService } from './compras.service';
import { AnularCompraDto } from './dto/anular-compra.dto';
import { CreateCompraDto } from './dto/create-compra.dto';
import { ListComprasQueryDto } from './dto/list-compras-query.dto';

// The /** */ comments on each route are the Swagger summary and description.
// Purchases are only for the ADMIN (decided 31/10: the ADMIN loads suppliers and purchases).
@ApiTags('compras')
@ApiBearerAuth()
@Roles(Rol.ADMIN)
@Controller('compras')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  /**
   * Cargar una compra a un proveedor (solo ADMIN)
   *
   * @remarks Queda APLICADA al cargarla: cada línea suma `cantidad` envases al
   * stock del artículo y su `costoUnitario` pasa a ser el `precioCosto` del
   * artículo. La fecha es la de carga. En el historial de cada artículo
   * (`GET /articulos/:id/movimientos`) aparece como un movimiento COMPRA con el
   * número de comprobante. Responde la compra con sus `lineas` (con `subtotal`)
   * y el `total`, en pesos. 400 si el proveedor no existe o está dado de baja,
   * si un artículo no existe, está dado de baja o se repite en la compra, o si
   * el stock pasaría los 9.999.999,999 envases; 409 si ese proveedor ya tiene
   * una compra (no anulada) con el mismo `numComprobante` (no distingue
   * mayúsculas).
   */
  @Post()
  create(@Body() dto: CreateCompraDto, @Req() req: Request) {
    return this.comprasService.create(dto, (req.user as PublicUser).id);
  }

  /**
   * Listar las compras (solo ADMIN)
   *
   * @remarks De la más nueva a la más vieja, por páginas: `{ items, total,
   * pagina, porPagina }` (por defecto 50 por página, máximo 200). Cada item
   * tiene el mismo formato que la respuesta del alta. `desde` y `hasta` son
   * días (YYYY-MM-DD, hora del salón, los dos incluidos); 400 si una fecha no
   * existe o si `desde` es posterior a `hasta`.
   */
  @Get()
  findAll(@Query() query: ListComprasQueryDto) {
    return this.comprasService.findAll(query);
  }

  /**
   * Ver una compra (solo ADMIN)
   *
   * @remarks También una anulada (`estado` ANULADO, con su `motivo`). 404 si no
   * existe.
   */
  @Get(':id')
  findOne(@Param('id', ParseIdPipe) id: number) {
    return this.comprasService.findOne(id);
  }

  /**
   * Anular una compra (solo ADMIN)
   *
   * @remarks Pasa a ANULADO, guarda el `motivo` y resta del stock lo que había
   * sumado cada línea. El `precioCosto` de los artículos no vuelve atrás. Si lo
   * comprado ya se usó, el stock puede quedar negativo: se anula igual y
   * `sinStock` lista esos artículos (`[{ id, nombre, stock }]`). Si un artículo
   * queda en su mínimo o debajo, los ADMIN reciben el mail de stock mínimo. Una
   * compra anulada no se puede volver a aplicar (se carga de nuevo; su número
   * de comprobante queda libre). Responde `{ compra, sinStock }`. 404 si no
   * existe; 400 si ya estaba anulada.
   */
  @Patch(':id/anular')
  anular(@Param('id', ParseIdPipe) id: number, @Body() dto: AnularCompraDto) {
    return this.comprasService.anular(id, dto);
  }
}
