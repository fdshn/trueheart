/**
 * Đánh giá sau giao dịch (F42) và chỉ số Giver Accuracy (F43).
 */

/** Vai của người đang đánh giá trong lượt trao. */
export enum TransactionReviewRoles {
  GIVER = 'GIVER',
  RECEIVER = 'RECEIVER',
}

/**
 * Số mẫu tối thiểu trước khi công bố chỉ số accuracy.
 *
 * Dưới ngưỡng này thì chỉ số là `null` chứ không phải một con số tạm — kết
 * luận "người này mô tả sai 40%" từ MỘT lần đánh giá là bôi nhọ chứ không phải
 * đo lường.
 */
export const MinGiverAccuracySamples = 5;

/**
 * Dưới ngưỡng này thì tài khoản vào diện Admin xem xét.
 *
 * **Không tự động phạt** (F43). Cờ này chỉ đưa hồ sơ lên bàn Admin; mọi chế
 * tài vẫn là quyết định của người thật.
 */
export const GiverAccuracyReviewThreshold = 75;

export const MaxReviewCommentLength = 1000;

export interface IAccuracySnapshot {
  /** Chỉ số công bố, `null` khi chưa đủ mẫu. */
  readonly percent: number | null;
  readonly samples: number;
  /** Đưa vào diện Admin xem xét. Luôn `false` khi chưa đủ mẫu. */
  readonly reviewRequired: boolean;
}

/**
 * Tính lại chỉ số accuracy từ danh sách mẫu thô.
 *
 * Hàm thuần, không chạm database — nên kiểm được mọi ngưỡng biên mà không cần
 * dựng cluster. Làm tròn về số nguyên: một chỉ số hiện ra cho người dùng với
 * hai chữ số thập phân gợi ý một độ chính xác mà nó không có.
 */
export function computeGiverAccuracy(
  percents: readonly number[],
): IAccuracySnapshot {
  const samples = percents.length;

  if (samples < MinGiverAccuracySamples)
    return { percent: null, samples, reviewRequired: false };

  const total = percents.reduce((sum, value) => sum + value, 0);
  const percent = Math.round(total / samples);

  return {
    percent,
    samples,
    reviewRequired: percent < GiverAccuracyReviewThreshold,
  };
}
