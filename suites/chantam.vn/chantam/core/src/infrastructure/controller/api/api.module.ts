import { Module } from '@nestjs/common';
import { AuthControllerModule } from './auth/auth.module';
import { GiftPostControllerModule } from './gift-post/gift-post.module';

/** Gom mọi controller module theo resource. */
@Module({
  imports: [AuthControllerModule, GiftPostControllerModule],
})
export class ApiModule {}
