import { IGiftTransactionResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IConfirmGiftReceiptCommand {
  /** Người nhận, luôn lấy từ token đã xác thực. */
  userId: string;
  transactionId: string;
  /** Ảnh món đồ nhận được, tối đa 3 tấm. Tuỳ chọn. */
  evidenceKeys?: string[];
}

export type IConfirmGiftReceiptResult = IGiftTransactionResponseDto;

export interface IConfirmGiftReceiptUseCase extends IUseCase<
  IConfirmGiftReceiptCommand,
  IConfirmGiftReceiptResult
> {}

export const IConfirmGiftReceiptUseCase = Symbol('IConfirmGiftReceiptUseCase');
