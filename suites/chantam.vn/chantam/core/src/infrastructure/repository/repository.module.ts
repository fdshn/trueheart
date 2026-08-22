import { IGiftPostRepository } from '@/domain/ports/repository';
import { Global, Module } from '@nestjs/common';
import { GiftPostRepository } from './gift-post.repository';

/**
 * Repository có truy vấn tuỳ biến thì khai báo class riêng như dưới đây.
 * Repository chỉ dùng CRUD chuẩn thì dùng `Repositories.create([...])` của
 * `persistency-lib` cho gọn.
 */
@Global()
@Module({
  providers: [{ provide: IGiftPostRepository, useClass: GiftPostRepository }],
  exports: [IGiftPostRepository],
})
export class RepositoryModule {}
