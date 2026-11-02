import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { ApiFoto } from '../fotos/api-foto.decorator';
import type { ArchivoSubido } from '../fotos/fotos.service';
import { SubirFotoInterceptor } from '../fotos/subir-foto.interceptor';
import { Rol } from '../generated/prisma/client';
import { PublicUser } from '../users/users.service';
import { CreateFichaDto } from './dto/create-ficha.dto';
import { FichaDto } from './dto/ficha.dto';
import { SubirFotoFichaDto } from './dto/subir-foto-ficha.dto';
import { FichasService } from './fichas.service';

// Technical records (F08). Professionals only, except the client's own view
// (care instructions and photos of closed records).
// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('fichas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.PROFESIONAL)
@Controller()
export class FichasController {
  constructor(private readonly fichasService: FichasService) {}

  /**
   * Cargar la ficha técnica de un servicio del turno
   *
   * @remarks Solo el profesional de ese servicio (`turnoDetalleId`, de
   * `detalles[]` del turno), con el turno CONFIRMADO y desde que empieza
   * ese servicio (su `horaInicio` en `detalles[]`; antes, 400). Ningún campo
   * es obligatorio. 409 si ese servicio ya tiene ficha.
   *
   * Insumos: texto libre (`producto` obligatorio) o un artículo del inventario
   * con `articuloId` + `cantidad` (en su unidad). Con artículo, el back completa
   * `producto` (nombre), `marca` ("Marca Línea"), `tono` (tonalidad) y `unidad`
   * (tipoPeso) e ignora lo que venga. Solo artículos activos de uso SALON o
   * AMBOS (`GET /articulos?uso=SALON`); inexistente, dado de baja o VENTA → 400
   * y no se guarda nada; también si el costo de un insumo pasaría
   * $99.999.999,99 o su consumo 9.999.999,999 envases (con los valores actuales
   * del artículo). Guardar no mueve stock: se descuenta al completar el
   * turno (`PATCH /turnos/:id/completar`), y ahí se calcula `costoSubtotal`
   * de cada insumo con artículo (mientras está abierta, `null`).
   */
  @Post('turnos/:id/fichas')
  create(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CreateFichaDto,
    @Req() req: Request,
  ) {
    return this.fichasService.create(id, dto, req.user as PublicUser);
  }

  /**
   * Historial de fichas de una clienta
   *
   * @remarks Todas sus fichas, de la más nueva a la más vieja, con fecha,
   * servicio y profesional. Cualquier PROFESIONAL del salón.
   */
  @Get('clientes/:id/fichas')
  findDelCliente(@Param('id', ParseIdPipe) id: number) {
    return this.fichasService.findDelCliente(id);
  }

  /**
   * Mis fichas (CLIENTE)
   *
   * @remarks Las fichas de sus turnos completados, de la más nueva a la más
   * vieja: fecha, servicio, profesional, `indicacionesCliente` y las fotos de
   * antes y después (`fotos[]`, la imagen en `GET /fichas/:id/fotos/:fotoId`)
   * y `actualizadaEn` (última edición: el profesional puede editarla cerrada).
   * Sin el diagnóstico, las fórmulas ni las observaciones internas.
   */
  @Get('fichas/mias')
  @Roles(Rol.CLIENTE)
  findMias(@Req() req: Request) {
    return this.fichasService.findMias(req.user as PublicUser);
  }

  /**
   * Ver una foto de la ficha
   *
   * @remarks Devuelve la imagen. Cualquier PROFESIONAL; la clienta, solo las de
   * sus fichas cerradas (404 si no). Con login: pedirla con fetch + blob, no
   * con `<img src>` directo.
   */
  @Get('fichas/:id/fotos/:fotoId')
  @Roles(Rol.PROFESIONAL, Rol.CLIENTE)
  @ApiFoto()
  verFoto(
    @Param('id', ParseIdPipe) id: number,
    @Param('fotoId', ParseIdPipe) fotoId: number,
    @Req() req: Request,
  ) {
    return this.fichasService.verFoto(id, fotoId, req.user as PublicUser);
  }

  /**
   * Subir una foto de antes o después (el profesional de ese servicio)
   *
   * @remarks `multipart/form-data` con la imagen en `foto` (JPG, PNG o WEBP de
   * hasta 2 MB) y `tipo` = `ANTES` o `DESPUES`. Hasta 5 de cada una, también con
   * la ficha cerrada. Devuelve la ficha.
   */
  @Post('fichas/:id/fotos')
  @UseInterceptors(SubirFotoInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['foto', 'tipo'],
      properties: {
        foto: { type: 'string', format: 'binary' },
        tipo: { type: 'string', enum: ['ANTES', 'DESPUES'] },
      },
    },
  })
  subirFoto(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: SubirFotoFichaDto,
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @Req() req: Request,
  ) {
    return this.fichasService.subirFoto(
      id,
      dto.tipo,
      archivo,
      req.user as PublicUser,
    );
  }

  /** Quitar una foto (el profesional de ese servicio, también con la ficha cerrada) */
  @Delete('fichas/:id/fotos/:fotoId')
  quitarFoto(
    @Param('id', ParseIdPipe) id: number,
    @Param('fotoId', ParseIdPipe) fotoId: number,
    @Req() req: Request,
  ) {
    return this.fichasService.quitarFoto(id, fotoId, req.user as PublicUser);
  }

  /** Ver una ficha (cualquier PROFESIONAL) */
  @Get('fichas/:id')
  findOne(@Param('id', ParseIdPipe) id: number) {
    return this.fichasService.findOne(id);
  }

  /**
   * Editar una ficha (el profesional de ese servicio)
   *
   * @remarks También después de cerrada (cuando el turno se completa), desde el
   * historial de la clienta: ella ve los cambios en `GET /fichas/mias` y
   * `actualizadaEn` muestra la última edición (incluye subir o quitar fotos).
   * Otro profesional: 403.
   * `null` (o `""` en los textos) borra un campo. `formulas` enviado reemplaza
   * todas las fórmulas; los insumos con `articuloId` se validan de nuevo como
   * en el alta, salvo que un artículo que ya estaba en esta ficha se puede
   * conservar aunque después se haya dado de baja o pasado a VENTA (agregarlo
   * nuevo, o en otra ficha, sigue siendo 400).
   *
   * Con la ficha cerrada, `formulas` también corrige el stock: se mueve solo la
   * diferencia con lo ya descontado (un movimiento CONSUMO más; usar menos
   * devuelve), `costoSubtotal` se recalcula con el precio actual y la respuesta
   * suma `sinStock` (como en completar). Sin `formulas`, o con la ficha
   * abierta, no hay `sinStock`.
   */
  @Patch('fichas/:id')
  update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: FichaDto,
    @Req() req: Request,
  ) {
    return this.fichasService.update(id, dto, req.user as PublicUser);
  }

  /**
   * Quitar una ficha (el profesional de ese servicio)
   *
   * @remarks Solo mientras está abierta: una ficha cerrada es parte del historial
   * de la clienta y responde 400.
   */
  @Delete('fichas/:id')
  async deactivate(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    await this.fichasService.deactivate(id, req.user as PublicUser);
    return { message: 'Ficha quitada' };
  }
}
