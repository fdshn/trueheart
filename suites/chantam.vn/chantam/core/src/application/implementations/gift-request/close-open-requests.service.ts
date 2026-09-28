import { IGiftRequestRepository } from '@/domain/ports/repository';
import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';
import { RequestLifecycleNotifier } from './request-lifecycle.notifier';

/**
 * Đóng mọi yêu cầu còn treo khi một bài đóng lại, và báo cho người xin.
 *
 * **Vì sao phải có một chỗ dùng chung.** Có ba đường làm bài đóng lại — tác giả
 * gỡ, bài hết hạn theo lịch, Admin hậu kiểm gỡ — và trước 28/09 **không đường
 * nào** đóng `gift_requests`. Đường gỡ bài có vẻ đã lo việc đó, nhưng
 * `closeOpenRequestsForPost` mà nó gọi chỉ đụng `gift_transactions`; yêu cầu ở
 * `PENDING`/`STANDBY` không có lượt trao nào nên không bị đụng tới.
 *
 * Hậu quả nặng hơn vẻ ngoài. Yêu cầu treo vẫn tính vào `OPEN_REQUEST_QUOTA`,
 * nên một người xin năm món mà cả năm bài hết hạn sẽ **đứng ở trần vĩnh viễn**,
 * không xin được gì nữa — và trước khi có `GET /requests/me` thì cũng không có
 * màn hình nào để nhìn thấy vì sao.
 */
@Injectable()
export class CloseOpenRequestsService {
  public constructor(
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    private readonly notifier: RequestLifecycleNotifier,
  ) {}

  /**
   * Gọi SAU khi bài đã đổi trạng thái.
   *
   * Gọi trước thì một lỗi ở bước đổi trạng thái sẽ để lại những yêu cầu đã đóng
   * dưới một bài vẫn đang mở — người xin mất chỗ mà bài thì vẫn nhận người mới.
   *
   * @param reason Một câu hoàn chỉnh, ghép thẳng vào thông báo.
   */
  public async closeFor(params: {
    postIds: string[];
    reason: string;
  }): Promise<number> {
    const closed = await this.giftRequestRepository.closeOpenForPosts({
      postIds: params.postIds,
      status: GiftRequestStatuses.CANCELLED,
    });

    for (const row of closed)
      await this.notifier.announceClosed({
        requesterId: row.requesterId,
        postTitle: row.postTitle,
        requestId: row.requestId,
        reason: params.reason,
      });

    return closed.length;
  }
}
