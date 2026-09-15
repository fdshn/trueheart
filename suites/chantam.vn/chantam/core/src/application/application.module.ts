import { Module } from '@nestjs/common';
import { AuthUseCaseModule } from './implementations/auth/auth.module';
import { GiftPostModule } from './implementations/gift-post/gift-post.module';

/**
 * Chỉ import feature module cấp resource. Không import module hạ tầng
 * (INVARIANTS.md mục 2).
 */
@Module({
  imports: [AuthUseCaseModule, GiftPostModule],
})
export class ApplicationModule {}
