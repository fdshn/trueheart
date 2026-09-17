import { Module } from '@nestjs/common';
import { AuthUseCaseModule } from './implementations/auth/auth.module';
import { CategoryModule } from './implementations/category/category.module';
import { GiftPostModule } from './implementations/gift-post/gift-post.module';
import { PostModule } from './implementations/post/post.module';
import { ProfileModule } from './implementations/profile/profile.module';

/**
 * Chỉ import feature module cấp resource. Không import module hạ tầng
 * (INVARIANTS.md mục 2).
 */
@Module({
  imports: [
    AuthUseCaseModule,
    GiftPostModule,
    PostModule,
    ProfileModule,
    CategoryModule,
  ],
})
export class ApplicationModule {}
