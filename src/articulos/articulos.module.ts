import { Module } from '@nestjs/common';
import { MarcasModule } from '../marcas/marcas.module';
import { ArticulosController } from './articulos.controller';
import { ArticulosService } from './articulos.service';

@Module({
  imports: [MarcasModule],
  controllers: [ArticulosController],
  providers: [ArticulosService],
})
export class ArticulosModule {}
