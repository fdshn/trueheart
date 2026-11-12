import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  INotificationTarget,
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
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
      target: { type: NotificationTargetTypes.POST, id: params.postId },
      // Khoá theo YÊU CẦU: mỗi yêu cầu chỉ sinh một thông báo, kể cả khi người
      // xin rút rồi gửi lại — bản ghi cũ được dùng lại chứ không tạo mới.
      idempotencyKey: `GIFT_REQUEST_CREATED:${params.requestId}`,
    });
  }

  /** Báo người xin rằng chủ bài đã từ chối họ. */
  public async announceRejected(params: {
    requesterId: string;
    postId: string;
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
      target: { type: NotificationTargetTypes.POST, id: params.postId },
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
    postId: string;
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
      target: { type: NotificationTargetTypes.POST, id: params.postId },
      idempotencyKey: `GIFT_REQUEST_CLOSED:${params.requestId}`,
    });
  }

  /**
   * Báo người xin khi hàng chờ được cân lại (12/11) — sau mỗi lần kho đổi:
   *
   * - PENDING → STANDBY, hoặc STANDBY đổi sang `INSUFFICIENT_QUANTITY`: nói rõ lý do và việc
   *   họ làm được (giảm số lượng / rút / chờ). Không báo thì họ chỉ biết khi tự mở app.
   * - STANDBY → PENDING: hàng đã về, họ lại đang chờ chủ bài xét.
   *
   * Người trong `excludeUserIds` bỏ qua — vd ứng viên đã nhận thông báo "đang được xét tiếp" ở
   * đường huỷ lượt trao, không cần thêm một cái nữa. Khoá chống trùng gồm cả trạng thái, lý do
   * và số còn lại: cùng một lần cân gọi lại không báo hai lần, còn lần cân sau có số khác thì báo.
   */
  public async announceRebalanced(
    rows: readonly {
      requestId: string;
      requesterId: string;
      fromStatus: 'PENDING' | 'STANDBY';
      toStatus: 'PENDING' | 'STANDBY';
      statusReason: 'OUT_OF_STOCK' | 'INSUFFICIENT_QUANTITY' | null;
      postId: string;
      postTitle: string;
      remainingQuantity: number;
      requestedQuantity: number;
    }[],
    options: { excludeUserIds?: readonly string[] } = {},
  ): Promise<void> {
    const excluded = new Set(options.excludeUserIds ?? []);
    for (const row of rows) {
      if (excluded.has(row.requesterId)) continue;
      const key = `${row.requestId}:${row.toStatus}:${row.statusReason ?? '-'}:${row.remainingQuantity}`;

      if (row.toStatus === 'PENDING') {
        if (row.fromStatus !== 'STANDBY') continue;
        await this.send({
          userId: row.requesterId,
          type: NotificationTypes.GIFT_REQUEST_REOPENED,
          title: 'Bạn trở lại hàng chờ xét',
          body: `Bài "${row.postTitle}" đã có lại hàng — yêu cầu ${row.requestedQuantity} món của bạn đang chờ người tặng xét.`,
          referenceType: 'GIFT_REQUEST',
          referenceId: row.requestId,
          target: { type: NotificationTargetTypes.POST, id: row.postId },
          idempotencyKey: `GIFT_REQUEST_REOPENED:${key}`,
        });
        continue;
      }

      // STANDBY: báo khi vừa vào hàng chờ, hoặc khi lý do đổi sang "còn hàng nhưng thiếu" —
      // lúc đó giảm số lượng mới có tác dụng. Đổi sang OUT_OF_STOCK khi đã STANDBY thì không
      // có gì mới để làm, khỏi báo.
      const becameStandby = row.fromStatus === 'PENDING';
      const nowActionable =
        row.statusReason === 'INSUFFICIENT_QUANTITY' && !becameStandby;
      if (!becameStandby && !nowActionable) continue;
      await this.send({
        userId: row.requesterId,
        type: NotificationTypes.GIFT_REQUEST_STANDBY,
        ...standbyCopy(row),
        referenceType: 'GIFT_REQUEST',
        referenceId: row.requestId,
        target: { type: NotificationTargetTypes.POST, id: row.postId },
        idempotencyKey: `GIFT_REQUEST_STANDBY:${key}`,
      });
    }
  }

  /**
   * Nhắc người đang STANDBY vì thiếu hàng khi bài đã quá hạn xét mà không còn ai vừa số — nếu
   * họ không giảm, phần còn lại không trao được cho ai. Một lần cho mỗi mốc số còn lại.
   */
  public async nudgeStandby(row: {
    requestId: string;
    requesterId: string;
    postId: string;
    postTitle: string;
    remainingQuantity: number;
    requestedQuantity: number;
  }): Promise<void> {
    await this.send({
      userId: row.requesterId,
      type: NotificationTypes.GIFT_REQUEST_STANDBY,
      title: 'Bài vẫn còn hàng cho bạn',
      body: `Bài "${row.postTitle}" còn ${row.remainingQuantity} món — bạn đang xin ${row.requestedQuantity}. Giảm số lượng xuống ${row.remainingQuantity} để được xét ngay.`,
      referenceType: 'GIFT_REQUEST',
      referenceId: row.requestId,
      target: { type: NotificationTargetTypes.POST, id: row.postId },
      idempotencyKey: `GIFT_REQUEST_STANDBY_NUDGE:${row.requestId}:${row.remainingQuantity}`,
    });
  }

  private async send(command: {
    userId: string;
    type: NotificationTypes;
    title: string;
    body: string;
    referenceType: string;
    referenceId: string;
    target: INotificationTarget;
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

/** Câu chữ thông báo STANDBY theo lý do — hai lý do, hai việc khác nhau người xin làm được. */
function standbyCopy(row: {
  statusReason: 'OUT_OF_STOCK' | 'INSUFFICIENT_QUANTITY' | null;
  postTitle: string;
  remainingQuantity: number;
  requestedQuantity: number;
}): { title: string; body: string } {
  if (row.statusReason === 'INSUFFICIENT_QUANTITY')
    return {
      title: 'Không đủ số lượng bạn xin',
      body: `Bài "${row.postTitle}" chỉ còn ${row.remainingQuantity} món, ít hơn ${row.requestedQuantity} món bạn xin. Bạn có thể giảm số lượng, rút yêu cầu, hoặc tiếp tục chờ.`,
    };
  return {
    title: 'Món đồ tạm hết',
    body: `Bài "${row.postTitle}" vừa hết hàng. Yêu cầu của bạn được giữ trong hàng chờ — bạn sẽ được xét lại nếu có hàng hoàn về.`,
  };
}
