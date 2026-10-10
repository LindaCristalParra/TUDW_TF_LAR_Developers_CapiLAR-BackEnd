import { Module } from '@nestjs/common';
import { FotosService } from './fotos.service';

@Module({
  providers: [FotosService],
  exports: [FotosService],
})
export class FotosModule {}
