import { Module } from '@nestjs/common';
import { AuthUseCaseModule } from './implementations/auth/auth.module';
import { CategoryModule } from './implementations/category/category.module';
import { DiscoveryModule } from './implementations/discovery/discovery.module';
import { GiftPostModule } from './implementations/gift-post/gift-post.module';
import { OnboardingModule } from './implementations/onboarding/onboarding.module';
import { PointModule } from './implementations/point/point.module';
import { PostModule } from './implementations/post/post.module';
import { ProfileModule } from './implementations/profile/profile.module';
import { RankModule } from './implementations/rank/rank.module';
import { ReferralModule } from './implementations/referral/referral.module';

/**
 * Chỉ import feature module cấp resource. Không import module hạ tầng
 * (INVARIANTS.md mục 2).
 */
@Module({
  imports: [
    AuthUseCaseModule,
    DiscoveryModule,
    GiftPostModule,
    OnboardingModule,
    PointModule,
    ReferralModule,
    RankModule,
    PostModule,
    ProfileModule,
    CategoryModule,
  ],
})
export class ApplicationModule {}
