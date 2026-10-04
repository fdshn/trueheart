import { Module } from '@nestjs/common';
import { AdminConfigModule } from './implementations/admin-config/admin-config.module';
import { AffiliateModule } from './implementations/affiliate/affiliate.module';
import { AuthUseCaseModule } from './implementations/auth/auth.module';
import { BlogUseCaseModule } from './implementations/blog/blog.module';
import { CategoryModule } from './implementations/category/category.module';
import { CharityCampaignUseCaseModule } from './implementations/charity-campaign/charity-campaign.module';
import { ChatModule } from './implementations/chat/chat.module';
import { CheckInModule } from './implementations/check-in/check-in.module';
import { DharmaUseCaseModule } from './implementations/dharma/dharma.module';
import { DiscoveryModule } from './implementations/discovery/discovery.module';
import { EntitlementModule } from './implementations/entitlement/entitlement.module';
import { FeedModule } from './implementations/feed/feed.module';
import { GiftPostModule } from './implementations/gift-post/gift-post.module';
import { GiftRequestModule } from './implementations/gift-request/gift-request.module';
import { GroupModule } from './implementations/group/group.module';
import { HomeCampaignUseCaseModule } from './implementations/home-campaign/home-campaign.module';
import { LunarUseCaseModule } from './implementations/lunar/lunar.module';
import { MediaModule } from './implementations/media/media.module';
import { MeritUseCaseModule } from './implementations/merit/merit.module';
import { NotificationUseCaseModule } from './implementations/notification/notification.module';
import { OnboardingModule } from './implementations/onboarding/onboarding.module';
import { PointModule } from './implementations/point/point.module';
import { PostModule } from './implementations/post/post.module';
import { ProfileGateModule } from './implementations/profile/profile-gate.module';
import { ProfileModule } from './implementations/profile/profile.module';
import { RankModule } from './implementations/rank/rank.module';
import { ReferralModule } from './implementations/referral/referral.module';
import { ReportModule } from './implementations/report/report.module';
import { ReviewModule } from './implementations/review/review.module';
import { SponsorBannerUseCaseModule } from './implementations/sponsor-banner/sponsor-banner.module';
import { TransactionModule } from './implementations/transaction/transaction.module';

/**
 * Chỉ import feature module cấp resource. Không import module hạ tầng
 * (INVARIANTS.md mục 2).
 */
@Module({
  imports: [
    AffiliateModule,
    CheckInModule,
    AdminConfigModule,
    AuthUseCaseModule,
    ChatModule,
    FeedModule,
    ReviewModule,
    BlogUseCaseModule,
    CharityCampaignUseCaseModule,
    SponsorBannerUseCaseModule,
    MeritUseCaseModule,
    DharmaUseCaseModule,
    HomeCampaignUseCaseModule,
    LunarUseCaseModule,
    NotificationUseCaseModule,
    DiscoveryModule,
    EntitlementModule,
    GiftPostModule,
    GiftRequestModule,
    OnboardingModule,
    PointModule,
    ReferralModule,
    ReportModule,
    RankModule,
    PostModule,
    TransactionModule,
    GroupModule,
    MediaModule,
    ProfileGateModule,
    ProfileModule,
    CategoryModule,
  ],
})
export class ApplicationModule {}
