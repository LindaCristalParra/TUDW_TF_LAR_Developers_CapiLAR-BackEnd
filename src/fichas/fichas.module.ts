import { Module } from '@nestjs/common';
import { AlertasStockModule } from '../alertas-stock/alertas-stock.module';
import { FotosModule } from '../fotos/fotos.module';
import { ConsumoService } from './consumo.service';
import { FichasController } from './fichas.controller';
import { FichasService } from './fichas.service';

@Module({
  imports: [AlertasStockModule, FotosModule],
  controllers: [FichasController],
  providers: [FichasService, ConsumoService],
  // Completing a turno discounts its records' supplies; DiagnosticoModule reads the record with its rules.
  exports: [ConsumoService, FichasService],
})
export class FichasModule {}
