import {
  IAdminConfigRepository,
  IAdminUserRepository,
  ICategoryRepository,
  IChatRepository,
  IContentReactionRepository,
  IEntitlementRepository,
  IGiftRequestRepository,
  IGiftTransactionRepository,
  INotificationChannelRepository,
  INotificationRepository,
  IOnboardingTaskRepository,
  IPointLedgerRepository,
  IPostMediaRepository,
  IPostRepository,
  IRankRepository,
  IReferralRepository,
  ISystemLogRepository,
  IUserOnboardingTaskCompletionRepository,
  IUserRepository,
  IUserSessionRepository,
} from '@/domain/ports/repository';
import { Global, Module } from '@nestjs/common';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminConfigRepository } from './admin-config.repository';
import { AdminUserRepository } from './admin-user.repository';
import { CategoryRepository } from './category.repository';
import { ChatRepository } from './chat.repository';
import { ContentReactionRepository } from './content-reaction.repository';
import { EntitlementRepository } from './entitlement.repository';
import { GiftRequestRepository } from './gift-request.repository';
import { GiftTransactionRepository } from './gift-transaction.repository';
import { NotificationChannelRepository } from './notification-channel.repository';
import { NotificationRepository } from './notification.repository';
import { OnboardingTaskRepository } from './onboarding-task.repository';
import { PointLedgerRepository } from './point-ledger.repository';
import { PostMediaRepository } from './post-media.repository';
import { PostRepository } from './post.repository';
import { RankRepository } from './rank.repository';
import { ReferralRepository } from './referral.repository';
import { SystemLogRepository } from './system-log.repository';
import { UserOnboardingTaskCompletionRepository } from './user-onboarding-task-completion.repository';
import { UserSessionRepository } from './user-session.repository';
import { UserRepository } from './user.repository';

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
    { provide: IAdminConfigRepository, useClass: AdminConfigRepository },
    { provide: IAdminUserRepository, useClass: AdminUserRepository },
    { provide: IEntitlementRepository, useClass: EntitlementRepository },
    {
      provide: IContentReactionRepository,
      useClass: ContentReactionRepository,
    },
    { provide: IGiftRequestRepository, useClass: GiftRequestRepository },
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
    { provide: ISystemLogRepository, useClass: SystemLogRepository },
    { provide: IRankRepository, useClass: RankRepository },
    { provide: IPostRepository, useClass: PostRepository },
    { provide: IPostMediaRepository, useClass: PostMediaRepository },
    { provide: IUserRepository, useClass: UserRepository },
    {
      provide: IUserOnboardingTaskCompletionRepository,
      useClass: UserOnboardingTaskCompletionRepository,
    },
    { provide: IUserSessionRepository, useClass: UserSessionRepository },
  ],
  exports: [
    ICategoryRepository,
    IChatRepository,
    INotificationRepository,
    IAdminConfigRepository,
    IAdminUserRepository,
    IEntitlementRepository,
    IContentReactionRepository,
    IGiftRequestRepository,
    IGiftTransactionRepository,
    INotificationChannelRepository,
    IOnboardingTaskRepository,
    IPointLedgerRepository,
    IReferralRepository,
    ISystemLogRepository,
    IRankRepository,
    IPostRepository,
    IPostMediaRepository,
    IUserRepository,
    IUserOnboardingTaskCompletionRepository,
    IUserSessionRepository,
  ],
})
export class RepositoryModule {}
