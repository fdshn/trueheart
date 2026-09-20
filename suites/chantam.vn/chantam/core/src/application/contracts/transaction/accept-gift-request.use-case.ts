import { IGiftTransactionResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IAcceptGiftRequestCommand {
  /** Người tặng, luôn lấy từ token đã xác thực. */
  userId: string;
  transactionId: string;
}

export type IAcceptGiftRequestResult = IGiftTransactionResponseDto;

export interface IAcceptGiftRequestUseCase extends IUseCase<
  IAcceptGiftRequestCommand,
  IAcceptGiftRequestResult
> {}

export const IAcceptGiftRequestUseCase = Symbol('IAcceptGiftRequestUseCase');
