import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  IExpireDuePostsCommand,
  IExpireDuePostsResult,
  IExpireDuePostsUseCase,
} from '@/application/contracts/post';
import { CloseOpenRequestsService } from '@/application/implementations/gift-request/close-open-requests.service';
import { IPostRepository } from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Đóng vòng đời các bài đã quá hạn (F22), và chuyển bài rao vặt thành bài
 * Muốn Tặng thay vì cho hết hạn (F19 — CHỐT-05).
 *
 * Chạy từ lịch bên ngoài qua CLI `post:expire`, KHÔNG dùng scheduler trong
 * tiến trình: deploy nhiều replica thì mỗi replica chạy một bản sao.
 *
 * ## Ba việc, đúng thứ tự đó
 *
 * CHỐT-10 đòi khi bài hết hạn thì **đóng các phản hồi còn mở, thông báo cho các
 * bên, và giữ lịch sử**. Ba việc nằm ở ba chỗ:
 *
 * 1. `expireDuePosts` đổi trạng thái (và chuyển `CLASSIFIED` thành `OFFER`);
 * 2. `CloseOpenRequestsService` đóng yêu cầu về `CANCELLED` và báo cho từng
 *    **người xin** — lịch sử giữ nguyên vì dòng yêu cầu không bị xoá;
 * 3. lượt báo cho **chủ bài** ngay dưới đây.
 *
 * Việc thứ ba thêm 11/10. Tới trước đó chủ bài được nhắc trước 7 ngày qua
 * `POST_EXPIRING_SOON` rồi không ai nói gì nữa — nên người không mở app trong
 * tuần đó chỉ thấy bài mình biến khỏi feed mà không biết vì sao, và không biết là
 * bài `EXPIRED` vẫn gia hạn được.
 */
@Injectable()
export class ExpireDuePostsUseCase implements IExpireDuePostsUseCase {
  private readonly logger = new Logger(ExpireDuePostsUseCase.name);

  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    private readonly closeOpenRequests: CloseOpenRequestsService,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
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
      postIds: result.expiredPosts.map((post) => post.postId),
      reason: 'Bài đăng đã hết hạn,',
    });

    // Báo cho chủ bài CUỐI CÙNG, và từng bài một.
    //
    // Nuốt lỗi từng lượt: một `authorId` đã xoá tài khoản, hay một lượt đẩy hỏng,
    // không được làm job dừng giữa danh sách và bỏ sót những bài còn lại. Trạng
    // thái `EXPIRED` đã commit nên lượt chạy sau sẽ KHÔNG nhặt lại bài này — tức
    // một thông báo mất là mất hẳn, và đó vẫn là cái giá đúng so với việc để một
    // nửa danh sách không được đóng.
    for (const post of result.expiredPosts) {
      try {
        await this.dispatchNotification.handle({
          userId: post.authorId,
          type: NotificationTypes.POST_EXPIRED,
          title: 'Bài đăng của bạn đã hết hạn',
          body: `Bài "${post.title}" đã hết hạn và không còn hiện trên feed. Bạn vẫn gia hạn được một lần để đưa nó trở lại.`,
          referenceType: 'POST',
          referenceId: post.postId,
          // Một bài chỉ hết hạn một lần: câu `UPDATE` lọc `status = 'PUBLISHED'`
          // nên lượt quét sau không đụng nó nữa. Khoá theo bài là đủ, không cần
          // gắn thêm ngày.
          idempotencyKey: `POST_EXPIRED:${post.postId}`,
        });
      } catch (error) {
        this.logger.warn(
          `Không báo được bài hết hạn ${post.postId}: ${String(error)}`,
        );
      }
    }

    return result;
  }
}
