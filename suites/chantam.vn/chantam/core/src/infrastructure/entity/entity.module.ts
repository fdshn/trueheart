import {
  ICategoryEntity,
  IChatMessageEntity,
  IChatRoomEntity,
  IGiftPostEntity,
  IGiftRequestEntity,
  INotificationEntity,
  IOnboardingTaskEntity,
  IPostEntity,
  IPostMediaEntity,
  IReportEntity,
  ITransactionReviewEntity,
  IUserEntity,
  IUserOnboardingTaskCompletionEntity,
  IUserSessionEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { Global, Module } from '@nestjs/common';
import { CategoryEntity } from './category.entity';
import { ChatMessageEntity } from './chat-message.entity';
import { ChatRoomEntity } from './chat-room.entity';
import { GiftPostEntity } from './gift-post.entity';
import { GiftRequestEntity } from './gift-request.entity';
import { NotificationEntity } from './notification.entity';
import { OnboardingTaskEntity } from './onboarding-task.entity';
import { PostMediaEntity } from './post-media.entity';
import { PostEntity } from './post.entity';
import { ReportEntity } from './report.entity';
import { TransactionReviewEntity } from './transaction-review.entity';
import { UserOnboardingTaskCompletionEntity } from './user-onboarding-task-completion.entity';
import { UserSessionEntity } from './user-session.entity';
import { UserEntity } from './user.entity';

/**
 * Gắn interface entity (khai báo ở `core-lib`) với class TypeORM cụ thể.
 *
 * Nhờ lớp gián tiếp này, repository nhận entity qua token DI thay vì import
 * trực tiếp class — đúng quy tắc phụ thuộc của Clean Architecture.
 */
@Global()
@Module({
  providers: [
    { provide: ICategoryEntity, useValue: CategoryEntity },
    { provide: IChatRoomEntity, useValue: ChatRoomEntity },
    { provide: IChatMessageEntity, useValue: ChatMessageEntity },
    { provide: INotificationEntity, useValue: NotificationEntity },
    { provide: IGiftPostEntity, useValue: GiftPostEntity },
    { provide: IGiftRequestEntity, useValue: GiftRequestEntity },
    { provide: IOnboardingTaskEntity, useValue: OnboardingTaskEntity },
    { provide: IPostEntity, useValue: PostEntity },
    { provide: IPostMediaEntity, useValue: PostMediaEntity },
    { provide: IReportEntity, useValue: ReportEntity },
    {
      provide: ITransactionReviewEntity,
      useValue: TransactionReviewEntity,
    },
    { provide: IUserEntity, useValue: UserEntity },
    {
      provide: IUserOnboardingTaskCompletionEntity,
      useValue: UserOnboardingTaskCompletionEntity,
    },
    { provide: IUserSessionEntity, useValue: UserSessionEntity },
  ],
  exports: [
    ICategoryEntity,
    IGiftPostEntity,
    IGiftRequestEntity,
    IOnboardingTaskEntity,
    IPostEntity,
    IPostMediaEntity,
    IReportEntity,
    ITransactionReviewEntity,
    IUserEntity,
    IUserOnboardingTaskCompletionEntity,
    IUserSessionEntity,
  ],
})
export class EntityModule {}
