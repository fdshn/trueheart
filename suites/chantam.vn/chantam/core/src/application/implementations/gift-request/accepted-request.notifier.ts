import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Báo cho người được chọn làm người nhận.
 *
 * **Vì sao một chỗ chứ không hai.** Có hai đường dẫn tới việc chốt người nhận —
 * chủ bài duyệt tay, và job tự chọn khi hết đồng hồ (F75). Mỗi đường tự gửi là
 * mỗi đường có thể quên, và đúng chuyện đó đã xảy ra: mẫu `GIFT_REQUEST_ACCEPTED`
 * có từ migration `1792900000000` nhưng **không đường nào gửi nó** cho tới
 * 2026-09-25.
 *
 * Với auto-select, thông báo còn quan trọng hơn: người dùng không bấm gì cả:
 * hệ thống quyết hộ họ. Không báo thì họ chỉ biết khi tình cờ mở app, trong khi
 * người tặng đang chờ trả lời.
 */
@Injectable()
export class AcceptedRequestNotifier {
  private readonly logger = new Logger(AcceptedRequestNotifier.name);

  public constructor(
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  /**
   * Gọi SAU khi lượt trao đã ghi.
   *
   * Không bao giờ ném: lượt trao đã mở và phòng chat đã có. Ném ở đây khiến chỗ
   * gọi tưởng việc duyệt thất bại, và người dùng bấm lại một việc đã xong.
   */
  public async announce(params: {
    receiverId: string;
    postId: string;
    transactionId: string;
    /** `true` khi do job tự chọn, `false` khi chủ bài duyệt tay. */
    automatic: boolean;
  }): Promise<void> {
    try {
      await this.dispatchNotification.handle({
        userId: params.receiverId,
        type: NotificationTypes.GIFT_REQUEST_ACCEPTED,
        title: 'Yêu cầu của bạn đã được duyệt',
        body: params.automatic
          ? 'Hết thời gian chọn, hệ thống đã chọn bạn làm người nhận. Cuộc trò chuyện với người tặng đã mở.'
          : 'Người tặng đã chọn bạn. Cuộc trò chuyện với người tặng đã mở.',
        referenceType: 'GIFT_TRANSACTION',
        referenceId: params.transactionId,
        // Khoá theo LƯỢT TRAO: một lượt trao chỉ có một lần được duyệt, và hai
        // đường dẫn tới đây đều tạo đúng một lượt.
        idempotencyKey: `GIFT_REQUEST_ACCEPTED:${params.transactionId}`,
        variables: { automatic: params.automatic ? 'true' : 'false' },
      });
    } catch (error) {
      this.logger.warn(
        `Không báo được cho người nhận ${params.receiverId}: ${String(error)}`,
      );
    }
  }
}
