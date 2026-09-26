import { Module } from '@nestjs/common';
import { AdminConfigModule } from './implementations/admin-config/admin-config.module';
import { AuthUseCaseModule } from './implementations/auth/auth.module';
import { CategoryModule } from './implementations/category/category.module';
import { ChatModule } from './implementations/chat/chat.module';
import { DiscoveryModule } from './implementations/discovery/discovery.module';
import { EntitlementModule } from './implementations/entitlement/entitlement.module';
import { FeedModule } from './implementations/feed/feed.module';
import { GiftPostModule } from './implementations/gift-post/gift-post.module';
import { GiftRequestModule } from './implementations/gift-request/gift-request.module';
import { GroupModule } from './implementations/group/group.module';
import { MediaModule } from './implementations/media/media.module';
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
import { TransactionModule } from './implementations/transaction/transaction.module';

/**
 * Chỉ import feature module cấp resource. Không import module hạ tầng
 * (INVARIANTS.md mục 2).
 */
@Module({
  imports: [
    AdminConfigModule,
    AuthUseCaseModule,
    ChatModule,
    FeedModule,
    ReviewModule,
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
