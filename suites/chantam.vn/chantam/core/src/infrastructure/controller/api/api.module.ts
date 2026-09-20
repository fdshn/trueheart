import { Module } from '@nestjs/common';
import { AdminConfigControllerModule } from './admin-config/admin-config.module';
import { AdminPostControllerModule } from './admin-post/admin-post.module';
import { AuthControllerModule } from './auth/auth.module';
import { CategoryControllerModule } from './category/category.module';
import { ChatControllerModule } from './chat/chat.module';
import { DiscoveryControllerModule } from './discovery/discovery.module';
import { EntitlementControllerModule } from './entitlement/entitlement.module';
import { FeedControllerModule } from './feed/feed.module';
import { GiftPostControllerModule } from './gift-post/gift-post.module';
import { GiftRequestApiModule } from './gift-request/gift-request-api.module';
import { NotificationControllerModule } from './notification/notification.module';
import { OnboardingControllerModule } from './onboarding/onboarding.module';
import { PointControllerModule } from './point/point.module';
import { PostControllerModule } from './post/post.module';
import { ProfileControllerModule } from './profile/profile.module';
import { RankControllerModule } from './rank/rank.module';
import { ReferralControllerModule } from './referral/referral.module';
import { TransactionControllerModule } from './transaction/transaction.module';

/** Gom mọi controller module theo resource. */
@Module({
  imports: [
    AdminConfigControllerModule,
    AdminPostControllerModule,
    AuthControllerModule,
    CategoryControllerModule,
    ChatControllerModule,
    FeedControllerModule,
    DiscoveryControllerModule,
    EntitlementControllerModule,
    GiftPostControllerModule,
    GiftRequestApiModule,
    NotificationControllerModule,
    OnboardingControllerModule,
    PointControllerModule,
    PostControllerModule,
    ProfileControllerModule,
    ReferralControllerModule,
    RankControllerModule,
    TransactionControllerModule,
  ],
})
export class ApiModule {}
