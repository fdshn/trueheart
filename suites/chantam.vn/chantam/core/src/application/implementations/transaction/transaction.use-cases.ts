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
  IGiftTransactionRepository,
  IGiftTransactionSummary,
  IReopenedQueue,
} from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IGiftTransactionDto } from '@chantam.vn/chantam.core-lib/dto';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';

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
  ) {}

  public async handle(
    command: IConfirmGiftReceiptCommand,
  ): Promise<IConfirmGiftReceiptResult> {
    return {
      transaction: toDto(
        await this.transactions.confirmReceipt(
          command.transactionId,
          command.userId,
        ),
      ),
    };
  }
}

@Injectable()
export class CancelGiftTransactionUseCase implements ICancelGiftTransactionUseCase {
  public constructor(
    @Inject(IGiftTransactionRepository)
    private readonly transactions: IGiftTransactionRepository,
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatchNotification: IDispatchNotificationUseCase,
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
    if (queue.nextCandidateId === null) return;

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
      userId: queue.nextCandidateId,
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
