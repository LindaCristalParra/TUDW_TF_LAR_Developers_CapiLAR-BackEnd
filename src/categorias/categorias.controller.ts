import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import { CategoriasService } from './categorias.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';

// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('categorias')
@ApiBearerAuth()
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  /**
   * Listar las categorías de servicios
   *
   * @remarks Público, para agrupar los servicios. Solo las activas, por nombre.
   * Cada servicio trae su `categoria` en `GET /servicios`.
   */
  @Get()
  @Public()
  findAll() {
    return this.categoriasService.findAll();
  }

  /**
   * Listar todas las categorías, incluidas las dadas de baja (solo ADMIN)
   *
   * @remarks Para ver las dadas de baja y reactivarlas con `PATCH /categorias/:id/alta`.
   */
  @Get('todas')
  @Roles(Rol.ADMIN)
  findTodas() {
    return this.categoriasService.findAll(true);
  }

  /**
   * Crear una categoría (solo ADMIN)
   *
   * @remarks 409 si ya existe una con ese nombre (sin distinguir mayúsculas ni
   * acentos), aunque esté dada de baja: en ese caso, reactivarla.
   */
  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateCategoriaDto) {
    return this.categoriasService.create(dto);
  }

  /**
   * Renombrar una categoría (solo ADMIN)
   *
   * @remarks El cambio se ve también en sus servicios. 404 si no existe o está
   * dada de baja; 409 si el nombre ya lo usa otra.
   */
  @Patch(':id')
  @Roles(Rol.ADMIN)
  update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateCategoriaDto,
  ) {
    return this.categoriasService.update(id, dto);
  }

  /**
   * Dar de alta una categoría dada de baja (solo ADMIN)
   *
   * @remarks 404 si no existe; 400 si ya está activa.
   */
  @Patch(':id/alta')
  @Roles(Rol.ADMIN)
  reactivate(@Param('id', ParseIdPipe) id: number) {
    return this.categoriasService.reactivate(id);
  }

  /**
   * Dar de baja una categoría (solo ADMIN)
   *
   * @remarks Borrado lógico: deja de ofrecerse para los servicios. 409 si tiene
   * servicios activos (primero hay que pasarlos a otra categoría o darlos de
   * baja). 404 si no existe o ya estaba dada de baja.
   */
  @Delete(':id')
  @Roles(Rol.ADMIN)
  async deactivate(@Param('id', ParseIdPipe) id: number) {
    await this.categoriasService.deactivate(id);
    return { message: 'Categoría dada de baja' };
  }
}
