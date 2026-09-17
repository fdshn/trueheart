import {
  ICategoryRepository,
  IGiftPostRepository,
  IPostMediaRepository,
  IPostRepository,
  IUserRepository,
  IUserSessionRepository,
} from '@/domain/ports/repository';
import { Global, Module } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { GiftPostRepository } from './gift-post.repository';
import { PostMediaRepository } from './post-media.repository';
import { PostRepository } from './post.repository';
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
    { provide: IPostRepository, useClass: PostRepository },
    { provide: IPostMediaRepository, useClass: PostMediaRepository },
    { provide: IUserRepository, useClass: UserRepository },
    { provide: IUserSessionRepository, useClass: UserSessionRepository },
  ],
  exports: [
    ICategoryRepository,
    IGiftPostRepository,
    IPostRepository,
    IPostMediaRepository,
    IUserRepository,
    IUserSessionRepository,
  ],
})
export class RepositoryModule {}
