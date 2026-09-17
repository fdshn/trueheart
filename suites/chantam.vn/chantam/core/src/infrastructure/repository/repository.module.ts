import {
  ICategoryRepository,
  IGiftPostRepository,
  IUserRepository,
  IUserSessionRepository,
} from '@/domain/ports/repository';
import { Global, Module } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { GiftPostRepository } from './gift-post.repository';
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
    { provide: IUserRepository, useClass: UserRepository },
    { provide: IUserSessionRepository, useClass: UserSessionRepository },
  ],
  exports: [
    ICategoryRepository,
    IGiftPostRepository,
    IUserRepository,
    IUserSessionRepository,
  ],
})
export class RepositoryModule {}
