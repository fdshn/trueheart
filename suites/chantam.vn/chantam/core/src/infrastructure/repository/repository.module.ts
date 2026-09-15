import {
  IGiftPostRepository,
  IUserRepository,
  IUserSessionRepository,
} from '@/domain/ports/repository';
import { Global, Module } from '@nestjs/common';
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
    { provide: IGiftPostRepository, useClass: GiftPostRepository },
    { provide: IUserRepository, useClass: UserRepository },
    { provide: IUserSessionRepository, useClass: UserSessionRepository },
  ],
  exports: [IGiftPostRepository, IUserRepository, IUserSessionRepository],
})
export class RepositoryModule {}
