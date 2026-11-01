import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';
import { MarcasService } from './marcas.service';

// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('marcas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('marcas')
export class MarcasController {
  constructor(private readonly marcasService: MarcasService) {}

  /**
   * Listar las marcas (ADMIN o PROFESIONAL)
   *
   * @remarks Cada fila es marca + línea (ej. Fidelité / Argán), ordenadas por
   * razón social y línea.
   */
  @Get()
  @Roles(Rol.ADMIN, Rol.PROFESIONAL)
  findAll() {
    return this.marcasService.findAll();
  }

  /**
   * Crear una marca (solo ADMIN)
   *
   * @remarks 409 si ya existe esa razón social con esa línea (sin distinguir mayúsculas).
   */
  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateMarcaDto) {
    return this.marcasService.create(dto);
  }

  /**
   * Modificar una marca (solo ADMIN)
   *
   * @remarks Se actualizan solo los campos enviados. 404 si no existe; 409 si
   * queda igual a otra.
   */
  @Patch(':id')
  @Roles(Rol.ADMIN)
  update(@Param('id', ParseIdPipe) id: number, @Body() dto: UpdateMarcaDto) {
    return this.marcasService.update(id, dto);
  }

  /**
   * Borrar una marca (solo ADMIN)
   *
   * @remarks Solo si ningún artículo la usa, ni siquiera uno dado de baja: 409
   * si tiene. 404 si no existe.
   */
  @Delete(':id')
  @Roles(Rol.ADMIN)
  async remove(@Param('id', ParseIdPipe) id: number) {
    await this.marcasService.remove(id);
    return { message: 'Marca borrada' };
  }
}
