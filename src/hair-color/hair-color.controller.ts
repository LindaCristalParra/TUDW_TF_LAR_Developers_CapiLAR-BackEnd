import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { ArchivoSubido } from '../fotos/fotos.service';
import { SubirFotoInterceptor } from '../fotos/subir-foto.interceptor';
import { Rol } from '../generated/prisma/client';
import { PreviewColorDto, VistaPreviaColorDto } from './dto/preview-color.dto';
import { formatoImagen, HairColorService } from './hair-color.service';

// Virtual hair color try-on with YouCam (TP3, API 1). The professional can also
// use it to show a client how a color would look.
// The /** */ comments on each route are the Swagger summary and description.
@ApiTags('hair-color')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.CLIENTE, Rol.PROFESIONAL)
@Controller('hair-color')
export class HairColorController {
  constructor(private readonly hairColorService: HairColorService) {}

  /**
   * Probar un color de pelo en una selfie
   *
   * @remarks `multipart/form-data` con la selfie en `foto` (JPG o PNG de hasta
   * 2 MB, menos de 1920 px de ancho y 1080 px de alto, de frente y con el pelo
   * visible), `color` (hexadecimal, ej. `#8B6542`) e `intensidad` (0 a 100,
   * opcional, 80 por defecto). Devuelve el link a la imagen con el color, que
   * vence en 2 horas. La selfie no se guarda: se manda a YouCam y se descarta.
   * Puede tardar hasta un minuto.
   */
  @Post('preview')
  @UseInterceptors(SubirFotoInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['foto', 'color'],
      properties: {
        foto: { type: 'string', format: 'binary' },
        color: { type: 'string', example: '#8B6542' },
        intensidad: { type: 'integer', minimum: 0, maximum: 100, example: 80 },
      },
    },
  })
  preview(
    @Body() dto: PreviewColorDto,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ): Promise<VistaPreviaColorDto> {
    if (!archivo || archivo.size === 0) {
      throw new BadRequestException(
        'Mandá la foto en el campo "foto" (multipart/form-data)',
      );
    }
    const mime = formatoImagen(archivo.buffer);
    if (!mime) {
      throw new BadRequestException(
        'Para probar un color, la foto tiene que ser JPG o PNG',
      );
    }
    return this.hairColorService.preview(
      archivo.buffer,
      mime,
      dto.color,
      dto.intensidad,
    );
  }
}
