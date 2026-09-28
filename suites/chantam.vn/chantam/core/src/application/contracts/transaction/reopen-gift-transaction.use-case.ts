import { IGiftTransactionDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IReopenGiftTransactionCommand {
  actorUserId: string;
  transactionId: string;
  /** Bắt buộc — đây là quyết định sẽ bị hỏi lại. */
  reason: string;
}

export interface IReopenGiftTransactionResult {
  transaction: IGiftTransactionDto;
}

export interface IReopenGiftTransactionUseCase extends IUseCase<
  IReopenGiftTransactionCommand,
  IReopenGiftTransactionResult
> {}

export const IReopenGiftTransactionUseCase = Symbol(
  'IReopenGiftTransactionUseCase',
);
