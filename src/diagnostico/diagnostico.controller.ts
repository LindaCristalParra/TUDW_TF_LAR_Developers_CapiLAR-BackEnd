import { Controller, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { Limite } from '../common/limites';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { FichasService } from '../fichas/fichas.service';
import { Rol } from '../generated/prisma/client';
import { PublicUser } from '../users/users.service';
import { DiagnosticoService } from './diagnostico.service';
import { SugerenciaDiagnostico } from './sugerencia.dto';

// AI suggestion for the technical record (TP3, API 3). Saves nothing.
// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('diagnostico')
@ApiBearerAuth()
@Roles(Rol.PROFESIONAL)
@Controller()
export class DiagnosticoController {
  constructor(
    private readonly fichasService: FichasService,
    private readonly diagnosticoService: DiagnosticoService,
  ) {}

  /**
   * Sugerir la ficha con IA (Gemini)
   *
   * @remarks Le manda a Gemini las últimas 5 fichas cerradas de la clienta
   * (diagnóstico, fórmulas, tratamientos, indicaciones y observaciones
   * internas), sus alergias, lo ya cargado en esta ficha, los artículos de uso
   * del salón con stock y la última foto de ANTES, si hay. Nunca su nombre ni
   * sus datos de contacto: en los textos libres, su nombre y apellido, los
   * emails y los teléfonos se reemplazan por `[dato oculto]` antes de mandarlos. Devuelve una sugerencia para porosidad, elasticidad,
   * % de canas, tipo y volumen de pelo, un `analisis` (evolución, alertas y
   * recomendación) y `formulas` con la misma forma que las de la ficha (solo
   * con artículos del inventario). **No guarda nada**: la profesional la
   * revisa y guarda con `PATCH /fichas/:id`.
   *
   * Solo el profesional de ese servicio (403), con la ficha abierta (400).
   * 400 si no hay foto de ANTES ni fichas anteriores. 503 si la IA está
   * ocupada, 502 si no pudo armar la sugerencia, 504 si tardó demasiado.
   * 429 después de 20 sugerencias en una hora del mismo profesional.
   */
  @Post('fichas/:id/diagnostico')
  @Limite('diagnostico')
  @ApiCreatedResponse({ type: SugerenciaDiagnostico })
  async sugerir(
    @Param('id', ParseIdPipe) id: number,
    @Req() req: Request,
  ): Promise<SugerenciaDiagnostico> {
    const { contexto, foto } = await this.fichasService.contextoParaDiagnostico(
      id,
      req.user as PublicUser,
    );
    return this.diagnosticoService.sugerir(contexto, foto);
  }
}
