import { Module } from '@nestjs/common';
import { ProveedoresController } from './proveedores.controller';
import { ProveedoresService } from './proveedores.service';

@Module({
  controllers: [ProveedoresController],
  providers: [ProveedoresService],
  // The purchases (F13, /compras) check that the supplier exists and is active.
  exports: [ProveedoresService],
})
export class ProveedoresModule {}
