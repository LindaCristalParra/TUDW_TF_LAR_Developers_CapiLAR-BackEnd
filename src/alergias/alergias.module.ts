import { Module } from '@nestjs/common';
import { AlergiasController } from './alergias.controller';
import { AlergiasService } from './alergias.service';

@Module({
  controllers: [AlergiasController],
  providers: [AlergiasService],
  // UsersModule and AuthModule use it to check the ids a client picks.
  exports: [AlergiasService],
})
export class AlergiasModule {}
