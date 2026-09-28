import { Module } from '@nestjs/common';
import { GiftRequestController } from './gift-request.controller';
import { MyGiftRequestController } from './my-gift-request.controller';

@Module({
  controllers: [GiftRequestController, MyGiftRequestController],
})
export class GiftRequestApiModule {}
