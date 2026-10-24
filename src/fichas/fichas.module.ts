import { Module } from '@nestjs/common';
import { FotosModule } from '../fotos/fotos.module';
import { FichasController } from './fichas.controller';
import { FichasService } from './fichas.service';

@Module({
  imports: [FotosModule],
  controllers: [FichasController],
  providers: [FichasService],
  // DiagnosticoModule uses it to get the ANTES photo with the record's rules.
  exports: [FichasService],
})
export class FichasModule {}
