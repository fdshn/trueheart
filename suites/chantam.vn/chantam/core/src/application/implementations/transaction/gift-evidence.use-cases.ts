import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  IMarkGiftHandedOverCommand,
  IMarkGiftHandedOverResult,
  IMarkGiftHandedOverUseCase,
  IRequestGiftEvidenceUploadCommand,
  IRequestGiftEvidenceUploadResult,
  IRequestGiftEvidenceUploadUseCase,
} from '@/application/contracts/transaction';
import {
  GiftTransactionNotFoundException,
  GiftTransactionNotParticipantException,
} from '@/domain/exceptions';
import { IGiftTransactionRepository } from '@/domain/ports/repository';
import {
  MaxEvidencePerKind,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { withStorageValidation } from '../shared/storage-error';

/**
 * Xin đường tải ảnh bằng chứng cho một lượt trao (CH-2).
 *
 * Presigned PUT như ảnh bài đăng và avatar — máy chủ không nhận file, chỉ cấp
 * quyền ghi vào đúng một khoá. Khoá mang cả `userId` lẫn `transactionId`, nên
 * không ai tải được vào không gian của người khác hay của lượt trao khác.
 *
 * Cả hai bên đều xin được: người tặng chụp lúc trao và lúc hàng hoàn, người
 * nhận chụp lúc nhận.
 */
@Injectable()
export class RequestGiftEvidenceUploadUseCase implements IRequestGiftEvidenceUploadUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
  ) {}

  public async handle(
    command: IRequestGiftEvidenceUploadCommand,
  ): Promise<IRequestGiftEvidenceUploadResult> {
    const transaction = await this.transactions.findByGlobalId(
      command.transactionId,
    );
    if (!transaction) throw new GiftTransactionNotFoundException();

    const isParticipant =
      transaction.giverId === command.userId ||
      transaction.receiverId === command.userId;
    if (!isParticipant) throw new GiftTransactionNotParticipantException();

    const upload = await this.storage.createTransactionEvidenceUpload({
      userId: command.userId,
      transactionId: command.transactionId,
      contentType: command.contentType,
      contentLength: command.contentLength,
    });

    return { upload };
  }
}

/**
 * Người tặng báo đã trao đồ — `ACCEPTED` → `DELIVERING` (H1).
 *
 * **Không phải riêng cho ship.** Tự đến lấy cũng có lúc trao đồ, và tranh chấp
 * "tôi chưa hề nhận được" vẫn xảy ra khi không có ship.
 *
 * Mốc `handedOverAt` đẩy lùi đồng hồ tự hoàn tất: trước đây đồng hồ đếm từ lúc
 * duyệt, nên ship liên tỉnh 4–5 ngày bị cron đóng trước khi hàng tới nơi.
 *
 * Ảnh là **tuỳ chọn** ở đây. Thiếu ảnh thì lượt trao vẫn đi tiếp, chỉ mất quyền
 * report — chặn ở đây là phạt người tặng vì một việc họ không bắt buộc phải
 * làm, và đẩy lượt trao vào tự-hoàn-tất sau 5 ngày.
 */
@Injectable()
export class MarkGiftHandedOverUseCase implements IMarkGiftHandedOverUseCase {
  private readonly logger = new Logger(MarkGiftHandedOverUseCase.name);

  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IObjectStorage)
    private readonly storage: IObjectStorage,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: IMarkGiftHandedOverCommand,
  ): Promise<IMarkGiftHandedOverResult> {
    // Xác nhận từng object CÓ THẬT trên storage trước khi ghi vào database:
    // client gửi một chuỗi key bịa ra thì database sẽ mang một bằng chứng trỏ
    // vào hư không, và điều đó chỉ lộ ra lúc có tranh chấp — đúng lúc tệ nhất.
    const keys = (command.evidenceKeys ?? []).slice(0, MaxEvidencePerKind);
    for (const key of keys)
      await withStorageValidation('evidenceKeys', () =>
        this.storage.confirmTransactionEvidenceUpload(
          command.userId,
          command.transactionId,
          key,
        ),
      );

    const transaction = await this.transactions.markHandedOver({
      transactionId: command.transactionId,
      giverId: command.userId,
      evidenceKeys: keys,
    });

    // Chỉ báo NGƯỜI NHẬN: người tặng vừa tự bấm nút này nên họ đã biết.
    //
    // Đây cũng là lúc đồng hồ tự hoàn tất được đặt lại — nó đếm từ
    // `COALESCE(handed_over_at, accepted_at)` — nên người nhận có đúng 5 ngày
    // để xác nhận hoặc khiếu nại trước khi hệ thống tự khép. Không báo thì cái
    // đồng hồ đó chạy sau lưng họ.
    try {
      await this.dispatchNotification.handle({
        userId: transaction.receiverId,
        type: NotificationTypes.GIFT_TRANSACTION_HANDED_OVER,
        title: 'Người tặng đã bàn giao',
        body: 'Người tặng vừa báo đã trao vật phẩm. Hãy xác nhận khi bạn nhận được — quá 5 ngày hệ thống sẽ tự khép lượt trao này.',
        referenceType: 'GIFT_TRANSACTION',
        referenceId: transaction.globalId,
        // Khoá theo LƯỢT TRAO: bàn giao chỉ xảy ra một lần cho mỗi lượt.
        idempotencyKey: `GIFT_TRANSACTION_HANDED_OVER:${transaction.globalId}`,
      });
    } catch (error) {
      // Bàn giao đã ghi xong. Ném ở đây khiến người tặng tưởng thất bại và bấm
      // lại một việc đã xong.
      this.logger.warn(
        `Không báo được bàn giao cho ${transaction.receiverId}: ${String(error)}`,
      );
    }

    return {
      transaction: {
        transactionId: transaction.globalId,
        postId: transaction.postId,
        giverId: transaction.giverId,
        receiverId: transaction.receiverId,
        quantity: transaction.quantity,
        status: transaction.status,
        requestedAt: transaction.requestedAt,
        acceptedAt: transaction.acceptedAt,
        handedOverAt: transaction.handedOverAt,
        completedAt: transaction.completedAt,
      },
    };
  }
}
