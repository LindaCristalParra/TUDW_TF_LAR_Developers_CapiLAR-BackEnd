import { Module } from '@nestjs/common';
import { HairColorController } from './hair-color.controller';
import { HairColorService } from './hair-color.service';

@Module({
  controllers: [HairColorController],
  providers: [HairColorService],
})
export class HairColorModule {}
