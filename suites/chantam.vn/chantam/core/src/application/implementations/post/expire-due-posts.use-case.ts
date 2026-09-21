import {
  IExpireDuePostsCommand,
  IExpireDuePostsResult,
  IExpireDuePostsUseCase,
} from '@/application/contracts/post';
import { IPostRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Đóng vòng đời các bài đã quá hạn (F22), và chuyển bài rao vặt thành bài
 * Muốn Tặng thay vì cho hết hạn (F19 — CHỐT-05).
 *
 * Chạy từ lịch bên ngoài qua CLI `post:expire`, KHÔNG dùng scheduler trong
 * tiến trình: deploy nhiều replica thì mỗi replica chạy một bản sao.
 */
@Injectable()
export class ExpireDuePostsUseCase implements IExpireDuePostsUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
  ) {}

  public async handle(
    command: IExpireDuePostsCommand,
  ): Promise<IExpireDuePostsResult> {
    return this.postRepository.expireDuePosts(command.now ?? new Date());
  }
}
