import { Module } from '@nestjs/common';
import { MarcasModule } from '../marcas/marcas.module';
import { ArticulosController } from './articulos.controller';
import { ArticulosService } from './articulos.service';
import { MovimientosController } from './movimientos.controller';
import { MovimientosService } from './movimientos.service';

@Module({
  imports: [MarcasModule],
  controllers: [ArticulosController, MovimientosController],
  providers: [ArticulosService, MovimientosService],
})
export class ArticulosModule {}
