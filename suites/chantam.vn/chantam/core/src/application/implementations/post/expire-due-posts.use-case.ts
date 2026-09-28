import {
  IExpireDuePostsCommand,
  IExpireDuePostsResult,
  IExpireDuePostsUseCase,
} from '@/application/contracts/post';
import { CloseOpenRequestsService } from '@/application/implementations/gift-request/close-open-requests.service';
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
    private readonly closeOpenRequests: CloseOpenRequestsService,
  ) {}

  public async handle(
    command: IExpireDuePostsCommand,
  ): Promise<IExpireDuePostsResult> {
    const result = await this.postRepository.expireDuePosts(
      command.now ?? new Date(),
    );

    // Đóng SAU khi bài đã sang EXPIRED. Đóng trước thì một lỗi ở bước đổi
    // trạng thái sẽ để lại những yêu cầu đã đóng dưới một bài vẫn đang mở.
    await this.closeOpenRequests.closeFor({
      postIds: result.expiredPostIds,
      reason: 'Bài đăng đã hết hạn,',
    });

    return result;
  }
}
