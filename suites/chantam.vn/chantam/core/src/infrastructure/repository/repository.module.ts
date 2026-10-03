import {
  IAdminConfigRepository,
  IAdminUserRepository,
  IAffiliateRepository,
  IBlogRepository,
  IBulkNotifyAudienceRepository,
  ICategoryRepository,
  IChatRepository,
  ICheckInRepository,
  IContentCommentRepository,
  IContentReactionRepository,
  IContentShareRepository,
  IEntitlementRepository,
  IGiftRequestRepository,
  IGiftTransactionRepository,
  IGroupRepository,
  IHomeCampaignRepository,
  ILunarHolidayRepository,
  INotificationBroadcastRepository,
  INotificationChannelRepository,
  INotificationRepository,
  INotificationTemplateRepository,
  IOnboardingTaskRepository,
  IPointLedgerRepository,
  IPostMediaRepository,
  IPostRepository,
  IRankRepository,
  IReferralRepository,
  IReportRepository,
  ISystemLogRepository,
  ITransactionReviewRepository,
  IUserOnboardingTaskCompletionRepository,
  IUserRepository,
  IUserSessionRepository,
  IVerifiedPhoneRepository,
} from '@/domain/ports/repository';
import { Global, Module } from '@nestjs/common';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminConfigRepository } from './admin-config.repository';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import { AdminUserRepository } from './admin-user.repository';
import { AffiliateRepository } from './affiliate.repository';
import { BlogRepository } from './blog.repository';
import { CategoryRepository } from './category.repository';
import { ChatRepository } from './chat.repository';
import { CheckInRepository } from './check-in.repository';
import { ContentCommentRepository } from './content-comment.repository';
import { ContentReactionRepository } from './content-reaction.repository';
import { ContentShareRepository } from './content-share.repository';
import { EntitlementRepository } from './entitlement.repository';
import { GiftRequestRepository } from './gift-request.repository';
import { GiftTransactionRepository } from './gift-transaction.repository';
import { GroupRepository } from './group.repository';
import { HomeCampaignRepository } from './home-campaign.repository';
import {
  BulkNotifyAudienceRepository,
  LunarHolidayRepository,
} from './lunar-holiday.repository';
import { NotificationBroadcastRepository } from './notification-broadcast.repository';
import { NotificationChannelRepository } from './notification-channel.repository';
import { NotificationTemplateRepository } from './notification-template.repository';
import { NotificationRepository } from './notification.repository';
import { OnboardingTaskRepository } from './onboarding-task.repository';
import { PointLedgerRepository } from './point-ledger.repository';
import { PostMediaRepository } from './post-media.repository';
import { PostRepository } from './post.repository';
import { RankRepository } from './rank.repository';
import { ReferralRepository } from './referral.repository';
import { ReportRepository } from './report.repository';
import { SystemLogRepository } from './system-log.repository';
import { TransactionReviewRepository } from './transaction-review.repository';
import { UserOnboardingTaskCompletionRepository } from './user-onboarding-task-completion.repository';
import { UserSessionRepository } from './user-session.repository';
import { UserRepository } from './user.repository';
import { VerifiedPhoneRepository } from './verified-phone.repository';

/**
 * Repository có truy vấn tuỳ biến thì khai báo class riêng như dưới đây.
 * Repository chỉ dùng CRUD chuẩn thì dùng `Repositories.create([...])` của
 * `persistency-lib` cho gọn.
 */
@Global()
@Module({
  providers: [
    AdminBootstrapService,
    { provide: ICategoryRepository, useClass: CategoryRepository },
    { provide: IChatRepository, useClass: ChatRepository },
    { provide: INotificationRepository, useClass: NotificationRepository },
    {
      provide: INotificationTemplateRepository,
      useClass: NotificationTemplateRepository,
    },
    { provide: IAdminConfigRepository, useClass: AdminConfigRepository },
    { provide: IAdminUserRepository, useClass: AdminUserRepository },
    // Lớp cụ thể, không qua token: nó không có cài đặt thay thế nào và cũng không
    // cần — dựng một token chỉ để có đúng một cài đặt là thêm một lớp gián tiếp
    // không trả lại gì.
    AdminDashboardRepository,
    { provide: IEntitlementRepository, useClass: EntitlementRepository },
    { provide: IBlogRepository, useClass: BlogRepository },
    {
      provide: ILunarHolidayRepository,
      useClass: LunarHolidayRepository,
    },
    {
      provide: IBulkNotifyAudienceRepository,
      useClass: BulkNotifyAudienceRepository,
    },
    {
      provide: INotificationBroadcastRepository,
      useClass: NotificationBroadcastRepository,
    },
    {
      provide: IHomeCampaignRepository,
      useClass: HomeCampaignRepository,
    },
    {
      provide: IContentCommentRepository,
      useClass: ContentCommentRepository,
    },
    {
      provide: IContentReactionRepository,
      useClass: ContentReactionRepository,
    },
    {
      provide: IContentShareRepository,
      useClass: ContentShareRepository,
    },
    { provide: IGiftRequestRepository, useClass: GiftRequestRepository },
    { provide: ICheckInRepository, useClass: CheckInRepository },
    { provide: IAffiliateRepository, useClass: AffiliateRepository },
    {
      provide: IGiftTransactionRepository,
      useClass: GiftTransactionRepository,
    },
    {
      provide: INotificationChannelRepository,
      useClass: NotificationChannelRepository,
    },
    { provide: IOnboardingTaskRepository, useClass: OnboardingTaskRepository },
    { provide: IPointLedgerRepository, useClass: PointLedgerRepository },
    { provide: IReferralRepository, useClass: ReferralRepository },
    { provide: IGroupRepository, useClass: GroupRepository },
    { provide: IReportRepository, useClass: ReportRepository },
    { provide: ISystemLogRepository, useClass: SystemLogRepository },
    {
      provide: ITransactionReviewRepository,
      useClass: TransactionReviewRepository,
    },
    { provide: IRankRepository, useClass: RankRepository },
    { provide: IPostRepository, useClass: PostRepository },
    { provide: IPostMediaRepository, useClass: PostMediaRepository },
    { provide: IUserRepository, useClass: UserRepository },
    {
      provide: IVerifiedPhoneRepository,
      useClass: VerifiedPhoneRepository,
    },
    {
      provide: IUserOnboardingTaskCompletionRepository,
      useClass: UserOnboardingTaskCompletionRepository,
    },
    { provide: IUserSessionRepository, useClass: UserSessionRepository },
  ],
  exports: [
    IAffiliateRepository,
    ICheckInRepository,
    AdminDashboardRepository,
    ICategoryRepository,
    IChatRepository,
    INotificationRepository,
    INotificationTemplateRepository,
    IAdminConfigRepository,
    IAdminUserRepository,
    IEntitlementRepository,
    IBlogRepository,
    IHomeCampaignRepository,
    IBulkNotifyAudienceRepository,
    ILunarHolidayRepository,
    INotificationBroadcastRepository,
    IContentCommentRepository,
    IContentReactionRepository,
    IContentShareRepository,
    IGiftRequestRepository,
    IGiftTransactionRepository,
    INotificationChannelRepository,
    IOnboardingTaskRepository,
    IPointLedgerRepository,
    IReferralRepository,
    IReportRepository,
    ISystemLogRepository,
    ITransactionReviewRepository,
    IRankRepository,
    IPostRepository,
    IPostMediaRepository,
    IUserRepository,
    IVerifiedPhoneRepository,
    IUserOnboardingTaskCompletionRepository,
    IUserSessionRepository,
    IGroupRepository,
  ],
})
export class RepositoryModule {}
