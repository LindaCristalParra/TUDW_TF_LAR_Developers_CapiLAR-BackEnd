import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.PROFESIONAL)
@Controller()
export class DiagnosticoController {
  constructor(
    private readonly fichasService: FichasService,
    private readonly diagnosticoService: DiagnosticoService,
  ) {}

  /**
   * Sugerir el diagnóstico de la ficha con IA (Gemini)
   *
   * @remarks Analiza la última foto de ANTES de la ficha y devuelve una
   * sugerencia para porosidad, elasticidad, % de canas, tipo y volumen de pelo,
   * más una observación. **No guarda nada**: la profesional la revisa y guarda
   * con `PATCH /fichas/:id`. Solo el profesional de ese servicio, con la ficha
   * abierta (403 / 400). 400 si la ficha no tiene foto de ANTES. 503 si la IA
   * está ocupada, 502 si no pudo analizar la foto, 504 si tardó demasiado.
   */
  @Post('fichas/:id/diagnostico')
  @ApiCreatedResponse({ type: SugerenciaDiagnostico })
  async sugerir(
    @Param('id', ParseIdPipe) id: number,
    @Req() req: Request,
  ): Promise<SugerenciaDiagnostico> {
    const { buffer, mime } = await this.fichasService.fotoAntesParaDiagnostico(
      id,
      req.user as PublicUser,
    );
    return this.diagnosticoService.sugerir(buffer, mime);
  }
}
