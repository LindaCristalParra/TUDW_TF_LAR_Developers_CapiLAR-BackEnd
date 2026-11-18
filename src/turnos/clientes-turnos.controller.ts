import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Rol } from '../generated/prisma/client';
import { TurnosService } from './turnos.service';

// Next to GET /clientes/:id/fichas; TurnosController can't serve it (its prefix is /turnos).
@ApiTags('turnos')
@ApiBearerAuth()
@Roles(Rol.PROFESIONAL)
@Controller('clientes')
export class ClientesTurnosController {
  constructor(private readonly turnosService: TurnosService) {}

  /**
   * Turnos de una clienta (PROFESIONAL)
   *
   * @remarks Todos sus turnos con el salón (cualquier profesional, todos los
   * estados), del más nuevo al más viejo, con el mismo formato que la agenda.
   * También si está dada de baja. 404 si ese usuario no es cliente.
   */
  @Get(':id/turnos')
  findDeCliente(@Param('id', ParseIdPipe) id: number) {
    return this.turnosService.findDeCliente(id);
  }
}
