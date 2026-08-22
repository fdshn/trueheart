import { Module } from '@nestjs/common';
import { GiftPostControllerModule } from './gift-post/gift-post.module';

/** Gom mọi controller module theo resource. */
@Module({
  imports: [GiftPostControllerModule],
})
export class ApiModule {}
