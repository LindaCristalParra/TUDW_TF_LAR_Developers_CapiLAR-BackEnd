import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Rol } from '../generated/prisma/client';
import { RentabilidadQueryDto } from './dto/rentabilidad-query.dto';
import { ReportesService } from './reportes.service';

// The /** */ comments on each route are the Swagger summary and description.
// Cost and margin are for the ADMIN only (PWA-220).
@ApiTags('reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  /**
   * Rentabilidad de un período (solo ADMIN)
   *
   * @remarks Turnos COMPLETADO entre `desde` y `hasta` (incluidos, hasta 366
   * días). Por cada servicio hecho: `cobrado` = su `precioFinal`, `costo` = la
   * suma de los `costoSubtotal` de los insumos de su ficha activa (sin ficha,
   * 0) y `margen` = cobrado − costo. Viene el `total` (con la cantidad de
   * `turnos`), y el mismo cálculo `porServicio` y `porProfesional`. `cantidad`
   * es la cantidad de servicios hechos. `conCostoIncompleto` cuenta los
   * servicios con algún insumo de texto libre (sin costo): su margen real es
   * menor. Con `legajo` o `servicioId` cuenta solo esos servicios. Los importes
   * vienen como texto, sin ceros de más ("15000", "254.56").
   */
  @Get('rentabilidad')
  rentabilidad(@Query() query: RentabilidadQueryDto) {
    return this.reportesService.rentabilidad(query);
  }
}
