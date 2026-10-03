import { Module } from '@nestjs/common';
import { AdminConfigControllerModule } from './admin-config/admin-config.module';
import { AdminPostControllerModule } from './admin-post/admin-post.module';
import { AffiliateControllerModule } from './affiliate/affiliate.module';
import { AuthControllerModule } from './auth/auth.module';
import { BlogControllerModule } from './blog/blog.module';
import { CategoryControllerModule } from './category/category.module';
import { CharityCampaignControllerModule } from './charity-campaign/charity-campaign.module';
import { ChatControllerModule } from './chat/chat.module';
import { CheckInControllerModule } from './check-in/check-in.module';
import { DiscoveryControllerModule } from './discovery/discovery.module';
import { EntitlementControllerModule } from './entitlement/entitlement.module';
import { FeedControllerModule } from './feed/feed.module';
import { GiftPostControllerModule } from './gift-post/gift-post.module';
import { GiftRequestApiModule } from './gift-request/gift-request-api.module';
import { GroupControllerModule } from './group/group.module';
import { HomeCampaignControllerModule } from './home-campaign/home-campaign.module';
import { LunarControllerModule } from './lunar/lunar.module';
import { NotificationControllerModule } from './notification/notification.module';
import { OnboardingControllerModule } from './onboarding/onboarding.module';
import { PointControllerModule } from './point/point.module';
import { PostControllerModule } from './post/post.module';
import { ProfileControllerModule } from './profile/profile.module';
import { RankControllerModule } from './rank/rank.module';
import { ReferralControllerModule } from './referral/referral.module';
import { ReportControllerModule } from './report/report.module';
import { ReviewControllerModule } from './review/review.module';
import { TransactionControllerModule } from './transaction/transaction.module';

/** Gom mọi controller module theo resource. */
@Module({
  imports: [
    AffiliateControllerModule,
    BlogControllerModule,
    CharityCampaignControllerModule,
    LunarControllerModule,
    HomeCampaignControllerModule,
    CheckInControllerModule,
    AdminConfigControllerModule,
    AdminPostControllerModule,
    AuthControllerModule,
    CategoryControllerModule,
    ChatControllerModule,
    FeedControllerModule,
    ReviewControllerModule,
    DiscoveryControllerModule,
    EntitlementControllerModule,
    GiftPostControllerModule,
    GiftRequestApiModule,
    NotificationControllerModule,
    OnboardingControllerModule,
    PointControllerModule,
    PostControllerModule,
    GroupControllerModule,
    ProfileControllerModule,
    ReferralControllerModule,
    ReportControllerModule,
    RankControllerModule,
    TransactionControllerModule,
  ],
})
export class ApiModule {}
