import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  AutoCompleteAfterDays,
  ICancelGiftTransactionCommand,
  ICancelGiftTransactionResult,
  ICancelGiftTransactionUseCase,
  ICompleteDueGiftDeliveriesCommand,
  ICompleteDueGiftDeliveriesResult,
  ICompleteDueGiftDeliveriesUseCase,
  IConfirmGiftReceiptCommand,
  IConfirmGiftReceiptResult,
  IConfirmGiftReceiptUseCase,
  IGetGiftTransactionCommand,
  IGetGiftTransactionResult,
  IGetGiftTransactionUseCase,
  IListOwnGiftTransactionsCommand,
  IListOwnGiftTransactionsResult,
  IListOwnGiftTransactionsUseCase,
} from '@/application/contracts/transaction';
import { GiftTransactionNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IChatRepository,
  IGiftTransactionRepository,
  IGiftTransactionSummary,
  IReopenedQueue,
} from '@/domain/ports/repository';
import {
  CandidateSelectionConfigKey,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IGiftTransactionDto } from '@chantam.vn/chantam.core-lib/dto';
import { pickNextCandidate } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Báo cho cả hai bên ngày phòng chat sẽ bị xoá.
 *
 * Gọi SAU khi transaction đóng lượt trao đã commit — báo bên trong transaction là
 * báo về một việc còn có thể bị rollback.
 *
 * Gửi ngày ĐÃ CHỐT chứ không phải "sau 1 tuần": Admin đổi cấu hình sau đó cũng
 * không dịch ngày của phòng này, nên câu chữ phải khớp với điều thực sự sẽ xảy ra.
 *
 * Thất bại ở đây KHÔNG được làm hỏng lượt trao đã xong: món đồ đã đến tay là một
 * sự thật, còn thông báo chỉ là tiện ích.
 */
async function notifyChatPurgeSchedule(
  chat: IChatRepository,
  dispatch: IDispatchNotificationUseCase,
  transaction: IGiftTransactionSummary,
): Promise<void> {
  const schedule = await chat.findPurgeSchedule(transaction.globalId);
  if (!schedule) return;

  const day = schedule.purgeAfter.toISOString().slice(0, 10);
  for (const userId of [transaction.giverId, transaction.receiverId])
    await dispatch.handle({
      userId,
      type: NotificationTypes.CHAT_ROOM_SCHEDULED_FOR_PURGE,
      title: 'Cuộc trò chuyện sẽ được xoá',
      body: `Lượt trao đã kết thúc. Tin nhắn trong cuộc trò chuyện này sẽ được xoá vào ngày ${day}. Lưu lại thông tin cần giữ trước ngày đó.`,
      referenceType: 'CHAT_ROOM',
      referenceId: schedule.roomId,
      idempotencyKey: `CHAT_PURGE_SCHEDULED:${schedule.roomId}:${userId}`,
    });
}

/**
 * Báo cho CẢ HAI bên rằng lượt trao đã hoàn tất.
 *
 * Mẫu `GIFT_TRANSACTION_COMPLETED` có từ migration `1792900000000` nhưng cho
 * tới 28/09 là mẫu DUY NHẤT trong migration đó chưa đường nào gửi — bảy mẫu còn
 * lại đều đã nối. Nghĩa là khoảnh khắc trọng tâm của cả sản phẩm, món đồ đến
 * tay người cần, không ai được báo.
 *
 * Gửi cho cả hai vì mỗi bên biết một nửa: người nhận vừa bấm xác nhận nên họ
 * biết, nhưng người tặng thì không — trừ khi tự mở app ra xem. Ở đường tự hoàn
 * tất thì KHÔNG bên nào biết.
 *
 * Không bao giờ ném: món đồ đã đến tay là một sự thật đã ghi, còn thông báo chỉ
 * là tiện ích. Ném ở đây khiến người nhận tưởng xác nhận thất bại và bấm lại.
 */
async function notifyTransactionCompleted(
  logger: Logger,
  dispatch: IDispatchNotificationUseCase,
  transaction: IGiftTransactionSummary,
  automatic: boolean,
): Promise<void> {
  for (const userId of [transaction.giverId, transaction.receiverId])
    try {
      await dispatch.handle({
        userId,
        type: NotificationTypes.GIFT_TRANSACTION_COMPLETED,
        title: 'Lượt trao đã hoàn tất',
        body: automatic
          ? 'Quá thời hạn xác nhận nên hệ thống đã khép lượt trao này. Nếu có gì chưa đúng, hãy báo cho quản trị viên.'
          : 'Người nhận đã xác nhận nhận được vật phẩm. Cảm ơn bạn.',
        referenceType: 'GIFT_TRANSACTION',
        referenceId: transaction.globalId,
        // Khoá theo LƯỢT TRAO và NGƯỜI: một lượt chỉ hoàn tất một lần, và hai
        // đường dẫn tới đây (xác nhận tay, tự hoàn tất) loại trừ nhau.
        idempotencyKey: `GIFT_TRANSACTION_COMPLETED:${transaction.globalId}:${userId}`,
        variables: { automatic: automatic ? 'true' : 'false' },
      });
    } catch (error) {
      logger.warn(
        `Không báo được lượt trao hoàn tất cho ${userId}: ${String(error)}`,
      );
    }
}

function toDto(summary: IGiftTransactionSummary): IGiftTransactionDto {
  return {
    transactionId: summary.globalId,
    postId: summary.postId,
    giverId: summary.giverId,
    receiverId: summary.receiverId,
    quantity: summary.quantity,
    status: summary.status,
    requestedAt: summary.requestedAt,
    acceptedAt: summary.acceptedAt,
    handedOverAt: summary.handedOverAt,
    completedAt: summary.completedAt,
  };
}

/**
 * Xem một lượt trao, chỉ hai bên trong cuộc.
 *
 * Trước 28/09 chỉ có `/transactions/me`. Trong khi mọi thông báo của luồng này
 * mang `referenceType: 'GIFT_TRANSACTION'` kèm `referenceId` — tức client bấm
 * vào thông báo thì không có đường nào mở đúng lượt đó, phải tải cả danh sách
 * rồi tự lọc.
 */
@Injectable()
export class GetGiftTransactionUseCase implements IGetGiftTransactionUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
  ) {}

  public async handle(
    command: IGetGiftTransactionCommand,
  ): Promise<IGetGiftTransactionResult> {
    const transaction = await this.transactions.findByGlobalId(
      command.transactionId,
    );

    // Người ngoài cuộc nhận 404 chứ không phải 403: 403 xác nhận rằng lượt trao
    // đó CÓ THẬT, và id đoán được thì đó là một kênh dò.
    if (
      !transaction ||
      (transaction.giverId !== command.userId &&
        transaction.receiverId !== command.userId)
    )
      throw new GiftTransactionNotFoundException();

    return { transaction: toDto(transaction) };
  }
}

@Injectable()
export class ConfirmGiftReceiptUseCase implements IConfirmGiftReceiptUseCase {
  private readonly logger = new Logger(ConfirmGiftReceiptUseCase.name);

  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: IConfirmGiftReceiptCommand,
  ): Promise<IConfirmGiftReceiptResult> {
    const transaction = await this.transactions.confirmReceipt(
      command.transactionId,
      command.userId,
      command.evidenceKeys ?? [],
    );

    // Sau khi commit. Hai thông báo, hai chuyện khác nhau: một cái nói lượt trao
    // đã xong, một cái nói lịch sử trò chuyện sắp bị xoá.
    await notifyTransactionCompleted(
      this.logger,
      this.dispatchNotification,
      transaction,
      false,
    );

    // Xác nhận xong là phòng chat khoá và đồng hồ xoá bắt đầu chạy — hai bên
    // cần biết để còn lưu lại địa chỉ hay số điện thoại đã hẹn.
    await notifyChatPurgeSchedule(
      this.chat,
      this.dispatchNotification,
      transaction,
    );

    return { transaction: toDto(transaction) };
  }
}

@Injectable()
export class CancelGiftTransactionUseCase implements ICancelGiftTransactionUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICancelGiftTransactionCommand,
  ): Promise<ICancelGiftTransactionResult> {
    const { transaction, queue } = await this.transactions.close({
      transactionId: command.transactionId,
      actorUserId: command.userId,
      status: 'CANCELLED',
      reason: command.cancellation.reason,
    });

    await this.announceQueue(transaction, queue);
    // Huỷ cũng khoá phòng, nên đồng hồ xoá cũng bắt đầu chạy. Báo ở một đường mà
    // không báo ở đường kia là để một nửa người dùng bất ngờ khi lịch sử biến mất.
    await notifyChatPurgeSchedule(
      this.chat,
      this.dispatchNotification,
      transaction,
    );

    return { transaction: toDto(transaction) };
  }

  /**
   * Báo cho người cho và ứng viên kế tiếp sau khi hàng đợi mở lại (F33).
   *
   * Gọi SAU khi `close()` đã commit: báo từ trong transaction rồi rollback là
   * nói với hai người về một lượt huỷ không xảy ra.
   *
   * Hệ thống **chỉ đề xuất**. Không tạo giao dịch cho người kế tiếp, không giữ
   * suất cho họ — người cho vẫn phải bấm duyệt. Vì thế thông báo gửi cho ứng
   * viên nói "đang được xét tiếp", không nói "đã được chọn".
   */
  private async announceQueue(
    transaction: IGiftTransactionSummary,
    queue: IReopenedQueue,
  ): Promise<void> {
    if (queue.candidates.length === 0) return;

    // Thứ tự ưu tiên do Admin cấu hình (CH-1). Đọc ở đây chứ không cache: đổi
    // cấu hình phải có hiệu lực ngay, không đợi restart.
    //
    // Cấu hình rỗng hay rác thì `pickNextCandidate` tự rơi về thứ tự mặc định —
    // một dòng config sai không được làm chết đường gợi ý người nhận.
    const configuredOrder = await this.adminConfig.getConfigValue(
      CandidateSelectionConfigKey,
    );
    const next = pickNextCandidate(
      queue.candidates,
      Array.isArray(configuredOrder) ? configuredOrder : null,
    );
    if (!next) return;

    await this.dispatchNotification.handle({
      userId: transaction.giverId,
      type: NotificationTypes.GIFT_TRANSACTION_CLOSED,
      title: 'Lượt trao đã huỷ, còn người đang chờ',
      body: `Còn ${queue.reopenedCount} người trong hàng đợi. Bạn chọn người kế tiếp khi thuận tiện.`,
      referenceType: 'GIFT_TRANSACTION',
      referenceId: transaction.globalId,
      idempotencyKey: `QUEUE_REOPENED_GIVER:${transaction.globalId}`,
    });

    await this.dispatchNotification.handle({
      userId: next.requesterId,
      type: NotificationTypes.GIFT_TRANSACTION_CLOSED,
      title: 'Yêu cầu của bạn đang được xét tiếp',
      body: 'Lượt trao trước đã huỷ. Người cho sẽ xem lại danh sách; đây chưa phải là đã được chọn.',
      referenceType: 'POST',
      referenceId: transaction.postId,
      idempotencyKey: `QUEUE_REOPENED_CANDIDATE:${transaction.globalId}`,
    });
  }
}

@Injectable()
export class ListOwnGiftTransactionsUseCase implements IListOwnGiftTransactionsUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
  ) {}

  public async handle(
    command: IListOwnGiftTransactionsCommand,
  ): Promise<IListOwnGiftTransactionsResult> {
    const summaries = await this.transactions.listForUser(command.userId);

    return { transactions: summaries.map(toDto) };
  }
}

@Injectable()
export class CompleteDueGiftDeliveriesUseCase implements ICompleteDueGiftDeliveriesUseCase {
  private readonly logger = new Logger(CompleteDueGiftDeliveriesUseCase.name);

  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
  ) {}

  public async handle(
    command: ICompleteDueGiftDeliveriesCommand,
  ): Promise<ICompleteDueGiftDeliveriesResult> {
    const outcome = await this.transactions.completeDueDeliveries(
      command.olderThanDays ?? AutoCompleteAfterDays,
    );

    // Đường này im lặng hoàn toàn cho tới 28/09: repository khoá phòng chat —
    // có chú thích hẳn hoi — rồi dừng ở đó. Nên hai bên mất CẢ HAI thông báo mà
    // `confirm` và `cancel` đều gửi, và ở đây thiếu chúng còn nặng hơn: người
    // dùng không bấm gì cả, nên thông báo là cách duy nhất họ biết lượt trao đã
    // khép và lịch sử trò chuyện sắp bị xoá.
    //
    // Một lượt báo hỏng không được chặn những lượt còn lại: `notifyTransactionCompleted`
    // tự nuốt lỗi, còn lịch xoá chat thì bọc riêng ở đây.
    for (const transaction of outcome.completedTransactions) {
      await notifyTransactionCompleted(
        this.logger,
        this.dispatchNotification,
        transaction,
        true,
      );
      try {
        await notifyChatPurgeSchedule(
          this.chat,
          this.dispatchNotification,
          transaction,
        );
      } catch (error) {
        this.logger.warn(
          `Không báo được lịch xoá chat của lượt ${transaction.globalId}: ${String(error)}`,
        );
      }
    }

    return {
      completedTransactions: outcome.completed,
      heldForDispute: outcome.heldForDispute,
    };
  }
}
