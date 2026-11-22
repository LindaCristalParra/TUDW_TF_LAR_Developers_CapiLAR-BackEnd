import { Module } from '@nestjs/common';
import { FichasModule } from '../fichas/fichas.module';
import { DiagnosticoController } from './diagnostico.controller';
import { DiagnosticoService } from './diagnostico.service';

@Module({
  imports: [FichasModule],
  controllers: [DiagnosticoController],
  providers: [DiagnosticoService],
})
export class DiagnosticoModule {}
