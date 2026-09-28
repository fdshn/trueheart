import { IGiftTransactionDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetGiftTransactionCommand {
  transactionId: string;
  /** Người gọi; phải là một trong hai bên của lượt trao. */
  userId: string;
}

export interface IGetGiftTransactionResult {
  transaction: IGiftTransactionDto;
}

export interface IGetGiftTransactionUseCase extends IUseCase<
  IGetGiftTransactionCommand,
  IGetGiftTransactionResult
> {}

export const IGetGiftTransactionUseCase = Symbol('IGetGiftTransactionUseCase');
