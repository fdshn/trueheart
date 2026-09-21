import { Module } from '@nestjs/common';
import { GiftRequestController } from './gift-request.controller';

@Module({
  controllers: [GiftRequestController],
})
export class GiftRequestApiModule {}
