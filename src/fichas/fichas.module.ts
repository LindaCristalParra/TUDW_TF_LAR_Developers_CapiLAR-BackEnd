import { Module } from '@nestjs/common';
import { FotosModule } from '../fotos/fotos.module';
import { FichasController } from './fichas.controller';
import { FichasService } from './fichas.service';

@Module({
  imports: [FotosModule],
  controllers: [FichasController],
  providers: [FichasService],
})
export class FichasModule {}
