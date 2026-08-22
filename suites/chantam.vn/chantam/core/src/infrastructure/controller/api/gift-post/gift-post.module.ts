import { Module } from '@nestjs/common';
import { GiftPostController } from './gift-post.controller';

@Module({
  controllers: [GiftPostController],
})
export class GiftPostControllerModule {}
