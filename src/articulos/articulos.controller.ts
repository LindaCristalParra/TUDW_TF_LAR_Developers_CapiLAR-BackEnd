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
import { ArticulosService } from './articulos.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { ListArticulosQueryDto } from './dto/list-articulos-query.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';

// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('articulos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('articulos')
export class ArticulosController {
  constructor(private readonly articulosService: ArticulosService) {}

  /**
   * Listar el stock (ADMIN o PROFESIONAL)
   *
   * @remarks Activos por defecto, ordenados por nombre, con su `marca` y
   * `bajoStock` (stock en el mínimo o debajo). `stock` y `stockMinAlert` van en
   * envases y, como los precios, llegan como texto (ej. "3.500", "12500.00").
   * Para el selector de la ficha: `uso=SALON` (trae también los AMBOS). El
   * PROFESIONAL recibe lo mismo que el ADMIN, `precioCosto` incluido (decisión
   * del salón).
   */
  @Get()
  @Roles(Rol.ADMIN, Rol.PROFESIONAL)
  findAll(@Query() query: ListArticulosQueryDto) {
    return this.articulosService.findAll(query);
  }

  /**
   * Ver un artículo (ADMIN o PROFESIONAL)
   *
   * @remarks También uno dado de baja (`fechaBaja` con fecha). 404 si no existe.
   * Igual que el listado, incluye `precioCosto` también para el PROFESIONAL.
   */
  @Get(':id')
  @Roles(Rol.ADMIN, Rol.PROFESIONAL)
  findOne(@Param('id', ParseIdPipe) id: number) {
    return this.articulosService.findOne(id);
  }

  /**
   * Crear un artículo (solo ADMIN)
   *
   * @remarks El back genera el texto del QR (`qr`, ej. "ART-7K2M9QXP"); el front
   * arma la imagen. `stock` es el stock inicial: después cambia con los
   * movimientos. `precioVenta` es obligatorio para uso VENTA o AMBOS y no va en
   * SALON. 400 si la marca no existe.
   */
  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateArticuloDto) {
    return this.articulosService.create(dto);
  }

  /**
   * Modificar un artículo (solo ADMIN)
   *
   * @remarks Se actualizan solo los campos enviados; el stock no (cambia con los
   * movimientos). Se valida cómo queda el artículo: uso VENTA o AMBOS sin
   * `precioVenta` es 400; pasar a SALON borra el precio de venta (mandarlo con
   * SALON es 400). 404 si no existe o está dado de baja; 400 si la marca no existe.
   */
  @Patch(':id')
  @Roles(Rol.ADMIN)
  update(@Param('id', ParseIdPipe) id: number, @Body() dto: UpdateArticuloDto) {
    return this.articulosService.update(id, dto);
  }

  /**
   * Dar de alta un artículo dado de baja (solo ADMIN)
   *
   * @remarks 404 si no existe; 400 si ya está activo.
   */
  @Patch(':id/alta')
  @Roles(Rol.ADMIN)
  reactivate(@Param('id', ParseIdPipe) id: number) {
    return this.articulosService.reactivate(id);
  }

  /**
   * Dar de baja un artículo (solo ADMIN)
   *
   * @remarks Borrado lógico: deja de ofrecerse, pero las fichas y los movimientos
   * que lo usan lo siguen mostrando. 404 si no existe o ya estaba dado de baja.
   */
  @Delete(':id')
  @Roles(Rol.ADMIN)
  async deactivate(@Param('id', ParseIdPipe) id: number) {
    await this.articulosService.deactivate(id);
    return { message: 'Artículo dado de baja' };
  }
}
