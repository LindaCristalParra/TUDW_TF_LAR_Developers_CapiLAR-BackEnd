import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { ListProveedoresQueryDto } from './dto/list-proveedores-query.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { ProveedoresService } from './proveedores.service';

// The /** */ comments on each route are the Swagger summary and description.
// Suppliers are only for the ADMIN (decided 31/10: the ADMIN loads suppliers and purchases).
@ApiTags('proveedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN)
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  /**
   * Listar los proveedores (solo ADMIN)
   *
   * @remarks Activos por defecto, ordenados por razón social. `cuit` llega solo
   * con los números (ej. "30712345678"); el front le pone los guiones si quiere.
   */
  @Get()
  findAll(@Query() query: ListProveedoresQueryDto) {
    return this.proveedoresService.findAll(query);
  }

  /**
   * Ver un proveedor (solo ADMIN)
   *
   * @remarks También uno dado de baja (`fechaBaja` con fecha). 404 si no existe.
   */
  @Get(':id')
  findOne(@Param('id', ParseIdPipe) id: number) {
    return this.proveedoresService.findOrFail(id);
  }

  /**
   * Marcas que se le compraron a un proveedor (solo ADMIN)
   *
   * @remarks Sale de sus compras no anuladas (un proveedor no tiene marcas
   * asignadas: se le puede comprar cualquier artículo). Sin repetir, ordenadas
   * por nombre; `[]` si todavía no tiene compras. También de un proveedor dado
   * de baja; 404 si no existe.
   */
  @Get(':id/marcas')
  findMarcas(@Param('id', ParseIdPipe) id: number) {
    return this.proveedoresService.findMarcas(id);
  }

  /**
   * Crear un proveedor (solo ADMIN)
   *
   * @remarks El CUIT se valida con su dígito verificador y puede venir con
   * guiones. 409 si ya hay un proveedor con ese CUIT, aunque esté dado de baja
   * (en ese caso, darlo de alta).
   */
  @Post()
  create(@Body() dto: CreateProveedorDto) {
    return this.proveedoresService.create(dto);
  }

  /**
   * Modificar un proveedor (solo ADMIN)
   *
   * @remarks Se actualizan solo los campos enviados; el CUIT también se puede
   * corregir (mismas reglas que en el alta). `telefono`, `email` y
   * `condicionesComerciales` se borran con `""` o `null`. 404 si no existe o
   * está dado de baja; 409 si el CUIT ya es de otro proveedor.
   */
  @Patch(':id')
  update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateProveedorDto,
  ) {
    return this.proveedoresService.update(id, dto);
  }

  /**
   * Dar de alta un proveedor dado de baja (solo ADMIN)
   *
   * @remarks 404 si no existe; 400 si ya está activo.
   */
  @Patch(':id/alta')
  reactivate(@Param('id', ParseIdPipe) id: number) {
    return this.proveedoresService.reactivate(id);
  }

  /**
   * Dar de baja un proveedor (solo ADMIN)
   *
   * @remarks Borrado lógico: no se le pueden cargar compras nuevas, pero las
   * compras anteriores lo siguen mostrando. 404 si no existe o ya estaba dado
   * de baja.
   */
  @Delete(':id')
  async deactivate(@Param('id', ParseIdPipe) id: number) {
    await this.proveedoresService.deactivate(id);
    return { message: 'Proveedor dado de baja' };
  }
}
