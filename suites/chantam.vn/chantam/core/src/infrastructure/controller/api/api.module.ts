import { Module } from '@nestjs/common';
import { AuthControllerModule } from './auth/auth.module';
import { CategoryControllerModule } from './category/category.module';
import { DiscoveryControllerModule } from './discovery/discovery.module';
import { EntitlementControllerModule } from './entitlement/entitlement.module';
import { GiftPostControllerModule } from './gift-post/gift-post.module';
import { PointControllerModule } from './point/point.module';
import { PostControllerModule } from './post/post.module';
import { ProfileControllerModule } from './profile/profile.module';
import { RankControllerModule } from './rank/rank.module';
import { ReferralControllerModule } from './referral/referral.module';

/** Gom mọi controller module theo resource. */
@Module({
  imports: [
    AuthControllerModule,
    CategoryControllerModule,
    DiscoveryControllerModule,
    EntitlementControllerModule,
    GiftPostControllerModule,
    PointControllerModule,
    PostControllerModule,
    ProfileControllerModule,
    ReferralControllerModule,
    RankControllerModule,
  ],
})
export class ApiModule {}
