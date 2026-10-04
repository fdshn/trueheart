import { Module } from '@nestjs/common';
import { MeritPublicController } from './merit-public.controller';
import { AdminMeritController, MeritController } from './merit.controller';

@Module({
  controllers: [AdminMeritController, MeritController, MeritPublicController],
})
export class MeritControllerModule {}
