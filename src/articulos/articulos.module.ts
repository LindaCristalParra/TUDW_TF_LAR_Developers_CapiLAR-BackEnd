import { Module } from '@nestjs/common';
import { AlertasStockModule } from '../alertas-stock/alertas-stock.module';
import { MarcasModule } from '../marcas/marcas.module';
import { ArticulosController } from './articulos.controller';
import { ArticulosService } from './articulos.service';
import { EnvaseEnUsoController } from './envase-en-uso.controller';
import { EnvaseEnUsoService } from './envase-en-uso.service';
import { MovimientosController } from './movimientos.controller';
import { MovimientosService } from './movimientos.service';

@Module({
  imports: [AlertasStockModule, MarcasModule],
  controllers: [
    ArticulosController,
    MovimientosController,
    EnvaseEnUsoController,
  ],
  providers: [ArticulosService, MovimientosService, EnvaseEnUsoService],
})
export class ArticulosModule {}
