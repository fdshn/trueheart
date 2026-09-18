import { Module } from '@nestjs/common';
import { AuthControllerModule } from './auth/auth.module';
import { CategoryControllerModule } from './category/category.module';
import { DiscoveryControllerModule } from './discovery/discovery.module';
import { GiftPostControllerModule } from './gift-post/gift-post.module';
import { PointControllerModule } from './point/point.module';
import { PostControllerModule } from './post/post.module';
import { ProfileControllerModule } from './profile/profile.module';
import { ReferralControllerModule } from './referral/referral.module';

/** Gom mọi controller module theo resource. */
@Module({
  imports: [
    AuthControllerModule,
    CategoryControllerModule,
    DiscoveryControllerModule,
    GiftPostControllerModule,
    PointControllerModule,
    PostControllerModule,
    ProfileControllerModule,
    ReferralControllerModule,
  ],
})
export class ApiModule {}
