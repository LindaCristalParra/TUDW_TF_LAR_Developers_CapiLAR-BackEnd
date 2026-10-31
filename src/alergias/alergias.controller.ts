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
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import { AlergiasService } from './alergias.service';
import { CreateAlergiaDto } from './dto/create-alergia.dto';
import { UpdateAlergiaDto } from './dto/update-alergia.dto';

// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('alergias')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alergias')
export class AlergiasController {
  constructor(private readonly alergiasService: AlergiasService) {}

  /**
   * Listar las alergias que puede elegir un cliente
   *
   * @remarks Público, para el registro y el perfil. Solo las activas, por nombre.
   * Se mandan los `id` en `alergiaIds`; lo que no esté en la lista va en `alergia` ("Otra").
   */
  @Get()
  @Public()
  findAll() {
    return this.alergiasService.findAll();
  }

  /**
   * Listar todas las alergias, incluidas las dadas de baja (solo ADMIN)
   *
   * @remarks Para ver las dadas de baja y reactivarlas con `PATCH /alergias/:id/alta`.
   */
  @Get('todas')
  @Roles(Rol.ADMIN)
  findTodas() {
    return this.alergiasService.findAll(true);
  }

  /**
   * Crear una alergia (solo ADMIN)
   *
   * @remarks 409 si ya existe una con ese nombre (sin distinguir mayúsculas),
   * aunque esté dada de baja: en ese caso, reactivarla.
   */
  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateAlergiaDto) {
    return this.alergiasService.create(dto);
  }

  /**
   * Modificar una alergia (solo ADMIN)
   *
   * @remarks Se actualizan solo los campos enviados. El cambio se ve también en
   * los clientes que ya la tienen. 404 si no existe o está dada de baja; 409 si
   * el nombre ya lo usa otra.
   */
  @Patch(':id')
  @Roles(Rol.ADMIN)
  update(@Param('id', ParseIdPipe) id: number, @Body() dto: UpdateAlergiaDto) {
    return this.alergiasService.update(id, dto);
  }

  /**
   * Dar de alta una alergia dada de baja (solo ADMIN)
   *
   * @remarks 404 si no existe; 400 si ya está activa.
   */
  @Patch(':id/alta')
  @Roles(Rol.ADMIN)
  reactivate(@Param('id', ParseIdPipe) id: number) {
    return this.alergiasService.reactivate(id);
  }

  /**
   * Dar de baja una alergia (solo ADMIN)
   *
   * @remarks Borrado lógico: deja de ofrecerse, pero los clientes que la tienen
   * la siguen mostrando. 404 si no existe o ya estaba dada de baja.
   */
  @Delete(':id')
  @Roles(Rol.ADMIN)
  async deactivate(@Param('id', ParseIdPipe) id: number) {
    await this.alergiasService.deactivate(id);
    return { message: 'Alergia dada de baja' };
  }
}
