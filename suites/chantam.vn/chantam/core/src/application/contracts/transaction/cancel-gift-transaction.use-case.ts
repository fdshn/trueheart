import {
  ICancelGiftTransactionDto,
  IGiftTransactionResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICancelGiftTransactionCommand {
  /** Người tặng hoặc người nhận, lấy từ token đã xác thực. */
  userId: string;
  transactionId: string;
  cancellation: ICancelGiftTransactionDto;
}

export type ICancelGiftTransactionResult = IGiftTransactionResponseDto;

export interface ICancelGiftTransactionUseCase extends IUseCase<
  ICancelGiftTransactionCommand,
  ICancelGiftTransactionResult
> {}

export const ICancelGiftTransactionUseCase = Symbol(
  'ICancelGiftTransactionUseCase',
);
