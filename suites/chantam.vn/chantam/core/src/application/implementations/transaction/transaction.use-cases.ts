import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import {
  AutoCompleteAfterDays,
  IAcceptGiftRequestCommand,
  IAcceptGiftRequestResult,
  IAcceptGiftRequestUseCase,
  ICancelGiftTransactionCommand,
  ICancelGiftTransactionResult,
  ICancelGiftTransactionUseCase,
  ICompleteDueGiftDeliveriesCommand,
  ICompleteDueGiftDeliveriesResult,
  ICompleteDueGiftDeliveriesUseCase,
  IConfirmGiftReceiptCommand,
  IConfirmGiftReceiptResult,
  IConfirmGiftReceiptUseCase,
  IListOwnGiftTransactionsCommand,
  IListOwnGiftTransactionsResult,
  IListOwnGiftTransactionsUseCase,
  IRequestGiftCommand,
  IRequestGiftResult,
  IRequestGiftUseCase,
} from '@/application/contracts/transaction';
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
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';

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

@Injectable()
export class RequestGiftUseCase implements IRequestGiftUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
  ) {}

  public async handle(
    command: IRequestGiftCommand,
  ): Promise<IRequestGiftResult> {
    const { giftRequest } = command;

    return {
      transaction: toDto(
        await this.transactions.request({
          globalId: makeGlobalId(
            `/transactions/${giftRequest.postId}/${command.userId}/${new Date().toISOString()}`,
          ),
          postId: giftRequest.postId,
          // Người nhận luôn là chủ token. Nhận từ body là cho phép xin hộ.
          receiverId: command.userId,
          quantity: giftRequest.quantity ?? 1,
        }),
      ),
    };
  }
}

@Injectable()
export class AcceptGiftRequestUseCase implements IAcceptGiftRequestUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
  ) {}

  public async handle(
    command: IAcceptGiftRequestCommand,
  ): Promise<IAcceptGiftRequestResult> {
    return {
      transaction: toDto(
        await this.transactions.accept(command.transactionId, command.userId),
      ),
    };
  }
}

@Injectable()
export class ConfirmGiftReceiptUseCase implements IConfirmGiftReceiptUseCase {
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

    // Sau khi commit. Xác nhận xong là phòng chat khoá và đồng hồ xoá bắt đầu chạy
    // — hai bên cần biết để còn lưu lại địa chỉ hay số điện thoại đã hẹn.
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
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
  ) {}

  public async handle(
    command: ICompleteDueGiftDeliveriesCommand,
  ): Promise<ICompleteDueGiftDeliveriesResult> {
    return {
      completedTransactions: await this.transactions.completeDueDeliveries(
        command.olderThanDays ?? AutoCompleteAfterDays,
      ),
    };
  }
}
