import {
  ICategoryEntity,
  IGiftPostEntity,
  IOnboardingTaskEntity,
  IPostEntity,
  IPostMediaEntity,
  IUserEntity,
  IUserOnboardingTaskCompletionEntity,
  IUserSessionEntity,
} from '@chantam.vn/chantam.core-lib/entities';
import { Global, Module } from '@nestjs/common';
import { CategoryEntity } from './category.entity';
import { GiftPostEntity } from './gift-post.entity';
import { OnboardingTaskEntity } from './onboarding-task.entity';
import { PostMediaEntity } from './post-media.entity';
import { PostEntity } from './post.entity';
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
    { provide: IGiftPostEntity, useValue: GiftPostEntity },
    { provide: IOnboardingTaskEntity, useValue: OnboardingTaskEntity },
    { provide: IPostEntity, useValue: PostEntity },
    { provide: IPostMediaEntity, useValue: PostMediaEntity },
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
    IOnboardingTaskEntity,
    IPostEntity,
    IPostMediaEntity,
    IUserEntity,
    IUserOnboardingTaskCompletionEntity,
    IUserSessionEntity,
  ],
})
export class EntityModule {}
