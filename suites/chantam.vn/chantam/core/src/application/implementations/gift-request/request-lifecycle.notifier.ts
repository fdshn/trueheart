import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Ba thông báo còn thiếu của vòng đời yêu cầu xin nhận.
 *
 * Gom một chỗ vì cùng một lý do đã khiến `GIFT_REQUEST_ACCEPTED` nằm im hai
 * tuần: mỗi đường tự gửi là mỗi đường có thể quên. Đóng yêu cầu treo có tới ba
 * đường gọi (tác giả gỡ bài, bài hết hạn, Admin hậu kiểm), nên chỗ này càng
 * phải là một.
 *
 * **Không bao giờ ném.** Việc chính đã ghi xong rồi — bài đã gỡ, yêu cầu đã
 * đóng. Ném ở đây chỉ khiến nơi gọi tưởng thao tác thất bại và bấm lại một việc
 * đã xong.
 */
@Injectable()
export class RequestLifecycleNotifier {
  private readonly logger = new Logger(RequestLifecycleNotifier.name);

  public constructor(
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  /**
   * Báo CHỦ BÀI rằng có người vừa xin.
   *
   * Thông báo quan trọng nhất của cả luồng, và là thông báo duy nhất từng
   * thiếu hẳn. Cả cơ chế đồng hồ 7 ngày giả định chủ bài BIẾT có ứng viên để
   * mà chốt sớm; không báo thì họ chỉ biết nếu tự mở bài ra xem.
   */
  public async announceCreated(params: {
    ownerId: string;
    requesterId: string;
    postId: string;
    postTitle: string;
    requestId: string;
  }): Promise<void> {
    // Không tự báo chính mình. Đường xin nhận đã chặn xin bài của mình, nhưng
    // phép kiểm ở đây rẻ và giữ cho notifier đúng kể cả khi có đường gọi khác.
    if (params.ownerId === params.requesterId) return;

    await this.send({
      userId: params.ownerId,
      type: NotificationTypes.GIFT_REQUEST_CREATED,
      title: 'Có người muốn nhận đồ của bạn',
      body: `Một người vừa gửi yêu cầu xin nhận cho bài "${params.postTitle}".`,
      referenceType: 'GIFT_REQUEST',
      referenceId: params.requestId,
      // Khoá theo YÊU CẦU: mỗi yêu cầu chỉ sinh một thông báo, kể cả khi người
      // xin rút rồi gửi lại — bản ghi cũ được dùng lại chứ không tạo mới.
      idempotencyKey: `GIFT_REQUEST_CREATED:${params.requestId}`,
    });
  }

  /** Báo người xin rằng chủ bài đã từ chối họ. */
  public async announceRejected(params: {
    requesterId: string;
    postTitle: string;
    requestId: string;
  }): Promise<void> {
    await this.send({
      userId: params.requesterId,
      type: NotificationTypes.GIFT_REQUEST_REJECTED,
      title: 'Yêu cầu của bạn chưa được chọn',
      body: `Người tặng đã không chọn yêu cầu của bạn cho bài "${params.postTitle}".`,
      referenceType: 'GIFT_REQUEST',
      referenceId: params.requestId,
      idempotencyKey: `GIFT_REQUEST_REJECTED:${params.requestId}`,
    });
  }

  /**
   * Báo người xin rằng yêu cầu bị đóng vì BÀI đóng lại.
   *
   * Tách khỏi "bị từ chối" vì lý do khác hẳn: không ai từ chối họ cả, món đồ
   * chỉ là không còn nữa. Nhận nhầm loại thông báo ở đây là để người ta tưởng
   * mình bị chê.
   */
  public async announceClosed(params: {
    requesterId: string;
    postTitle: string;
    requestId: string;
    reason: string;
  }): Promise<void> {
    await this.send({
      userId: params.requesterId,
      type: NotificationTypes.GIFT_REQUEST_CLOSED,
      title: 'Yêu cầu của bạn đã được đóng',
      body: `${params.reason} nên yêu cầu xin nhận của bạn cho bài "${params.postTitle}" được đóng lại.`,
      referenceType: 'GIFT_REQUEST',
      referenceId: params.requestId,
      idempotencyKey: `GIFT_REQUEST_CLOSED:${params.requestId}`,
    });
  }

  private async send(command: {
    userId: string;
    type: NotificationTypes;
    title: string;
    body: string;
    referenceType: string;
    referenceId: string;
    idempotencyKey: string;
  }): Promise<void> {
    try {
      await this.dispatchNotification.handle(command);
    } catch (error) {
      this.logger.warn(
        `Không báo được cho ${command.userId} (${command.type}): ${String(error)}`,
      );
    }
  }
}
