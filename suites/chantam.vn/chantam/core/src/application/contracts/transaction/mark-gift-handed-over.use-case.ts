import { IGiftTransactionResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IMarkGiftHandedOverCommand {
  /** Người tặng, luôn lấy từ token đã xác thực. */
  userId: string;
  transactionId: string;
  /**
   * Key ảnh đã tải lên, tối đa 3 tấm.
   *
   * Tuỳ chọn. Thiếu ảnh thì lượt trao vẫn đi tiếp bình thường, chỉ mất quyền
   * báo "người nhận không thanh toán phí ship" về sau — muốn trừ điểm người
   * khác thì phải để lại dấu vết trước, từ lúc chưa biết sẽ có tranh chấp.
   */
  evidenceKeys?: string[];
}

export type IMarkGiftHandedOverResult = IGiftTransactionResponseDto;

export interface IMarkGiftHandedOverUseCase extends IUseCase<
  IMarkGiftHandedOverCommand,
  IMarkGiftHandedOverResult
> {}

export const IMarkGiftHandedOverUseCase = Symbol('IMarkGiftHandedOverUseCase');
