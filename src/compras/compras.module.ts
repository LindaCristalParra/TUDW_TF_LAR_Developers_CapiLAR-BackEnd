import { Module } from '@nestjs/common';
import { AlertasStockModule } from '../alertas-stock/alertas-stock.module';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';

@Module({
  imports: [AlertasStockModule],
  controllers: [ComprasController],
  providers: [ComprasService],
})
export class ComprasModule {}
