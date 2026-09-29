import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Ba đường chốt người nhận, không hai.
 *
 * Trước 29/09 đây là một cờ boolean `automatic`, và đường đổi điểm truyền `false`
 * nên người vừa trả 500 điểm nhận được câu "Người tặng đã chọn bạn" — trong khi
 * người tặng không chọn ai cả. Một cờ hai giá trị không diễn tả được ba đường, và
 * chỗ sai không nằm ở code mà nằm trong câu nói với người dùng.
 */
export type AcceptanceTrigger = 'MANUAL' | 'AUTOMATIC' | 'REDEEMED';

const ReceiverBody: Record<AcceptanceTrigger, string> = {
  MANUAL: 'Người tặng đã chọn bạn. Cuộc trò chuyện với người tặng đã mở.',
  AUTOMATIC:
    'Hết thời gian chọn, hệ thống đã chọn bạn làm người nhận. Cuộc trò chuyện với người tặng đã mở.',
  REDEEMED:
    'Bạn đã dùng điểm để nhận vật phẩm này. Cuộc trò chuyện với người tặng đã mở.',
};

const GiverBody: Record<AcceptanceTrigger, string> = {
  // Không dùng: chủ bài tự bấm thì không được báo lại.
  MANUAL: '',
  AUTOMATIC:
    'Hết thời gian chọn, hệ thống đã chọn người nhận cho bài của bạn. Cuộc trò chuyện đã mở.',
  REDEEMED:
    'Một người đã dùng điểm để nhận vật phẩm của bạn, nên lượt trao được chốt ngay. Cuộc trò chuyện đã mở.',
};

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
    /** Chủ bài. Được báo riêng khi lượt chốt KHÔNG do họ bấm. */
    giverId: string;
    postId: string;
    transactionId: string;
    trigger: AcceptanceTrigger;
  }): Promise<void> {
    await this.notifyReceiver(params);
    await this.notifyGiverIfPassive(params);
  }

  private async notifyReceiver(params: {
    receiverId: string;
    transactionId: string;
    trigger: AcceptanceTrigger;
  }): Promise<void> {
    try {
      await this.dispatchNotification.handle({
        userId: params.receiverId,
        type: NotificationTypes.GIFT_REQUEST_ACCEPTED,
        title: 'Yêu cầu của bạn đã được duyệt',
        body: ReceiverBody[params.trigger],
        referenceType: 'GIFT_TRANSACTION',
        referenceId: params.transactionId,
        // Khoá theo LƯỢT TRAO: một lượt trao chỉ có một lần được duyệt, và ba
        // đường dẫn tới đây đều tạo đúng một lượt.
        idempotencyKey: `GIFT_REQUEST_ACCEPTED:${params.transactionId}`,
        variables: { trigger: params.trigger },
      });
    } catch (error) {
      this.logger.warn(
        `Không báo được cho người nhận ${params.receiverId}: ${String(error)}`,
      );
    }
  }

  /**
   * Báo cho chủ bài khi lượt chốt KHÔNG do họ bấm.
   *
   * Hai đường: job tự chọn khi hết đồng hồ, và người xin dùng điểm đổi thẳng. Ở cả
   * hai, chủ bài không làm gì mà bài đột nhiên RESERVED và một phòng chat mở ra —
   * trước 29/09 họ chỉ hiểu chuyện gì xảy ra khi người kia nhắn tin.
   *
   * Đường `MANUAL` thì im: họ vừa bấm, báo lại là nhắc một việc họ vừa làm.
   */
  private async notifyGiverIfPassive(params: {
    giverId: string;
    postId: string;
    transactionId: string;
    trigger: AcceptanceTrigger;
  }): Promise<void> {
    if (params.trigger === 'MANUAL') return;

    try {
      await this.dispatchNotification.handle({
        userId: params.giverId,
        type: NotificationTypes.GIFT_POST_RECEIVER_SELECTED,
        title: 'Bài của bạn đã có người nhận',
        body: GiverBody[params.trigger],
        referenceType: 'GIFT_TRANSACTION',
        referenceId: params.transactionId,
        idempotencyKey: `GIFT_POST_RECEIVER_SELECTED:${params.transactionId}`,
        variables: { trigger: params.trigger, postId: params.postId },
      });
    } catch (error) {
      this.logger.warn(
        `Không báo được cho chủ bài ${params.giverId}: ${String(error)}`,
      );
    }
  }
}
