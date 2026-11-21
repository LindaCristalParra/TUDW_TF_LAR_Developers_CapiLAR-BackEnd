import { Module } from '@nestjs/common';
import { CategoriasController } from './categorias.controller';
import { CategoriasService } from './categorias.service';

// Service categories (PWA-288). ServiciosService checks the category with its own query (it
// needs the row lock inside its transaction), so this module exports nothing.
@Module({
  controllers: [CategoriasController],
  providers: [CategoriasService],
})
export class CategoriasModule {}
