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
} from '@/domain/ports/repository';
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
  ) {}

  public async handle(
    command: ICancelGiftTransactionCommand,
  ): Promise<ICancelGiftTransactionResult> {
    return {
      transaction: toDto(
        await this.transactions.close({
          transactionId: command.transactionId,
          actorUserId: command.userId,
          status: 'CANCELLED',
          reason: command.cancellation.reason,
        }),
      ),
    };
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
