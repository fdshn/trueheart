import { IUseCase } from '@chantam/service.common-lib/use-case';

export interface IAwardGiftCompletionCommand {
  readonly transactionId: string;
  /** Người TẶNG — bên nhận điểm. */
  readonly giverId: string;
  /**
   * Mức chính xác người nhận chấm (0–100), hoặc `null` khi họ không đánh giá.
   *
   * `null` là tín hiệu để dùng mức mặc định trong cấu hình `review.grace`.
   */
  readonly accuracyPercent: number | null;
  /** `'USER'` khi do đánh giá kích hoạt, `'SYSTEM'` khi do job hết hạn chờ. */
  readonly source: string;
}

export interface IAwardGiftCompletionResult {
  /** `false` khi khoá chống trùng đã tồn tại, hoặc rule tắt / chạm cap ngày. */
  readonly awarded: boolean;
  /** Số điểm đã cộng. `0` khi không cộng, hoặc khi mức chấm là 0%. */
  readonly points: number;
  /** Phần trăm thực dùng — mức người nhận chấm, hoặc mức mặc định. */
  readonly appliedPercent: number;
  /** `true` khi dùng mức mặc định vì không có đánh giá. */
  readonly usedDefault: boolean;
}

export interface IAwardGiftCompletionUseCase extends IUseCase<
  IAwardGiftCompletionCommand,
  IAwardGiftCompletionResult
> {}

export const IAwardGiftCompletionUseCase = Symbol(
  'IAwardGiftCompletionUseCase',
);
