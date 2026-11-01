import {
  Body,
  Controller,
  Delete,
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
import { UpdateEnvaseEnUsoDto } from './dto/update-envase-en-uso.dto';
import { EnvaseEnUsoService } from './envase-en-uso.service';

// The open container of an item. Both roles use it, like the stock movements (decided 31/10).
@ApiTags('articulos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN, Rol.PROFESIONAL)
@Controller('articulos')
export class EnvaseEnUsoController {
  constructor(private readonly envaseEnUsoService: EnvaseEnUsoService) {}

  /**
   * Abrir un envase (ADMIN o PROFESIONAL)
   *
   * @remarks Queda lleno: `pesoActual` = `pesoInicial`, en el `tipoPeso` del
   * artículo. Si ya había uno abierto, lo reemplaza. No mueve el stock. Responde
   * el artículo, con el envase en `envaseEnUso`. 404 si el artículo no existe o
   * está dado de baja.
   */
  @Post(':id/envase-en-uso')
  abrir(@Param('id', ParseIdPipe) id: number) {
    return this.envaseEnUsoService.abrir(id);
  }

  /**
   * Actualizar lo que queda en el envase abierto (ADMIN o PROFESIONAL)
   *
   * @remarks Por ejemplo, después de pesarlo. `pesoActual` va de 0 al contenido
   * del envase. No mueve el stock. Responde el artículo. 404 si el artículo no
   * existe, está dado de baja o no tiene un envase abierto; 400 si supera
   * `pesoInicial`.
   */
  @Patch(':id/envase-en-uso')
  actualizar(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateEnvaseEnUsoDto,
  ) {
    return this.envaseEnUsoService.actualizar(id, dto);
  }

  /**
   * Terminar el envase abierto (ADMIN o PROFESIONAL)
   *
   * @remarks El artículo queda sin envase abierto (`envaseEnUso` en null). No
   * mueve el stock. Funciona también con un artículo dado de baja. 404 si el
   * artículo no existe o no tiene un envase abierto.
   */
  @Delete(':id/envase-en-uso')
  async terminar(@Param('id', ParseIdPipe) id: number) {
    await this.envaseEnUsoService.terminar(id);
    return { message: 'Envase terminado' };
  }
}
