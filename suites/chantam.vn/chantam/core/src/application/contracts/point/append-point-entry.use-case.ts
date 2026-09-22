import { IUseCase } from '@chantam/service.common-lib';

export interface IAppendPointEntryCommand {
  userId: string;
  ruleCode: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  actor: string;
  source: string;
  /**
   * Lý do, ghi thẳng vào `point_ledger.reason`.
   *
   * Cột này có sẵn từ migration đầu nhưng chưa nơi nào ghi. Với khoản CỘNG thì
   * mã rule đã đủ giải thích; với khoản TRỪ thì không — người bị trừ điểm sẽ
   * hỏi vì sao, và "SHIP_UNPAID_PENALTY" không phải một câu trả lời.
   */
  reason?: string;
}

export interface IAppendPointEntryResult {
  entryId: number;
  /** Mức thay đổi của bút toán này. Âm là khoản trừ. */
  delta: number;
  /** Số điểm TIÊU ĐƯỢC sau bút toán. Kẹp ở 0. */
  balance: number;
  /** Giá trị THẬT sau bút toán, có thể âm. */
  rawBalance: number;
  lifetime: number;
  /**
   * `false` khi `idempotencyKey` đã tồn tại, tức bút toán này đã ghi từ trước
   * và lần gọi hiện tại KHÔNG đổi gì.
   *
   * Nơi gọi cần phân biệt để không báo với người dùng rằng vừa trừ điểm trong
   * khi thực ra không trừ thêm đồng nào.
   */
  applied: boolean;
}

export interface IAppendPointEntryUseCase extends IUseCase<
  IAppendPointEntryCommand,
  IAppendPointEntryResult
> {}

export const IAppendPointEntryUseCase = Symbol('IAppendPointEntryUseCase');
