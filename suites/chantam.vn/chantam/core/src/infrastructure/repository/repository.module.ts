import {
  ICategoryRepository,
  IGiftPostRepository,
  IOnboardingTaskRepository,
  IPostMediaRepository,
  IPostRepository,
  IUserOnboardingTaskCompletionRepository,
  IUserRepository,
  IUserSessionRepository,
} from '@/domain/ports/repository';
import { Global, Module } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { GiftPostRepository } from './gift-post.repository';
import { OnboardingTaskRepository } from './onboarding-task.repository';
import { PostMediaRepository } from './post-media.repository';
import { PostRepository } from './post.repository';
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
    { provide: ICategoryRepository, useClass: CategoryRepository },
    { provide: IGiftPostRepository, useClass: GiftPostRepository },
    { provide: IOnboardingTaskRepository, useClass: OnboardingTaskRepository },
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
    IGiftPostRepository,
    IOnboardingTaskRepository,
    IPostRepository,
    IPostMediaRepository,
    IUserRepository,
    IUserOnboardingTaskCompletionRepository,
    IUserSessionRepository,
  ],
})
export class RepositoryModule {}
