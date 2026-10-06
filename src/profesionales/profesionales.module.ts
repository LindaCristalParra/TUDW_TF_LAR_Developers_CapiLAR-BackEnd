import { Module } from '@nestjs/common';
import { FotosModule } from '../fotos/fotos.module';
import { ProfesionalesController } from './profesionales.controller';
import { ProfesionalesService } from './profesionales.service';

@Module({
  imports: [FotosModule],
  controllers: [ProfesionalesController],
  providers: [ProfesionalesService],
})
export class ProfesionalesModule {}
