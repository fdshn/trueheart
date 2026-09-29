/**
 * Đánh giá sau giao dịch (F42) và chỉ số Giver Accuracy (F43).
 */

/** Vai của người đang đánh giá trong lượt trao. */
export enum TransactionReviewRoles {
  GIVER = 'GIVER',
  RECEIVER = 'RECEIVER',
}

export const MaxReviewCommentLength = 1000;

/** Khoá `system_configs` cho hai ngưỡng dưới đây (F61). */
export const GiverAccuracyConfigKey = 'accuracy.giver';

export interface IGiverAccuracyConfig {
  /**
   * Số mẫu tối thiểu trước khi công bố chỉ số.
   *
   * Dưới ngưỡng này thì chỉ số là `null` chứ không phải một con số tạm — kết
   * luận "người này mô tả sai 40%" từ MỘT lần đánh giá là bôi nhọ chứ không
   * phải đo lường.
   */
  readonly minSamples: number;
  /**
   * Dưới ngưỡng này thì tài khoản vào diện Admin xem xét.
   *
   * **Không tự động phạt** (F43). Cờ chỉ đưa hồ sơ lên bàn Admin; mọi chế tài
   * vẫn là quyết định của người thật.
   */
  readonly reviewThresholdPercent: number;
}

export const DefaultGiverAccuracyConfig: IGiverAccuracyConfig = {
  minSamples: 5,
  reviewThresholdPercent: 75,
};

/** Trần trên để một giá trị cấu hình sai không khoá vĩnh viễn chỉ số. */
export const MaxGiverAccuracySamples = 100;

/**
 * Đọc cấu hình từ `system_configs`, rơi về mặc định khi hỏng.
 *
 * Cấu hình gõ nhầm KHÔNG được biến thành "gắn cờ tất cả mọi người" — đó là
 * loại sự cố không ai nối được với một ô nhập liệu. Hỏng thì dùng mặc định.
 */
export function normalizeGiverAccuracyConfig(
  raw: unknown,
): IGiverAccuracyConfig {
  if (!raw || typeof raw !== 'object') return DefaultGiverAccuracyConfig;

  const source = raw as Record<string, unknown>;
  const samples = Number(source.minSamples);
  const threshold = Number(source.reviewThresholdPercent);

  if (!Number.isFinite(samples) || !Number.isFinite(threshold))
    return DefaultGiverAccuracyConfig;

  return {
    // Ít nhất 1 mẫu: 0 nghĩa là công bố chỉ số từ hư không.
    minSamples: Math.min(
      MaxGiverAccuracySamples,
      Math.max(1, Math.trunc(samples)),
    ),
    // 0 nghĩa là không bao giờ gắn cờ; 100 nghĩa là gắn cờ mọi người chưa
    // hoàn hảo. Cả hai đều hợp lệ, nên chỉ kẹp vào đúng khoảng phần trăm.
    reviewThresholdPercent: Math.min(100, Math.max(0, Math.trunc(threshold))),
  };
}

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
 * dựng cluster. Ngưỡng truyền vào chứ không đọc từ đâu cả, để cùng một bộ mẫu
 * với hai bộ ngưỡng luôn cho kết quả kiểm chứng được.
 *
 * Làm tròn về số nguyên: một chỉ số hiện ra cho người dùng với hai chữ số thập
 * phân gợi ý một độ chính xác mà nó không có.
 */
export function computeGiverAccuracy(
  percents: readonly number[],
  config: IGiverAccuracyConfig = DefaultGiverAccuracyConfig,
): IAccuracySnapshot {
  const samples = percents.length;

  if (samples < config.minSamples)
    return { percent: null, samples, reviewRequired: false };

  const total = percents.reduce((sum, value) => sum + value, 0);
  const percent = Math.round(total / samples);

  return {
    percent,
    samples,
    reviewRequired: percent < config.reviewThresholdPercent,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Điểm sao 1–5 (F42)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Khoá `system_configs` cho ngưỡng công bố điểm sao. */
export const ReviewRatingConfigKey = 'rating.display';

export interface IReviewRatingConfig {
  /**
   * Số mẫu tối thiểu trước khi công bố điểm sao.
   *
   * Cùng lý lẽ với `accuracy.giver`: một người mới nhận đúng một sao từ một lượt
   * trao không phải là "người 1 sao". Nhưng ngưỡng ở đây thấp hơn, vì điểm sao là
   * cảm nhận trải nghiệm chứ không phải một cáo buộc về mô tả sai — và nó KHÔNG
   * gắn cờ ai vào diện Admin xem xét.
   */
  readonly minSamples: number;
}

export const DefaultReviewRatingConfig: IReviewRatingConfig = { minSamples: 3 };

export function normalizeReviewRatingConfig(raw: unknown): IReviewRatingConfig {
  if (!raw || typeof raw !== 'object') return DefaultReviewRatingConfig;

  const samples = Number((raw as Record<string, unknown>).minSamples);
  if (!Number.isFinite(samples)) return DefaultReviewRatingConfig;

  return {
    minSamples: Math.min(
      MaxGiverAccuracySamples,
      Math.max(1, Math.trunc(samples)),
    ),
  };
}

export interface IRatingSnapshot {
  /** Điểm trung bình đã làm tròn một chữ số thập phân. `null` khi chưa đủ mẫu. */
  readonly average: number | null;
  readonly samples: number;
}

/**
 * Tính điểm sao trung bình từ danh sách mẫu thô.
 *
 * **Một chữ số thập phân, không làm tròn về số nguyên.** Khác với accuracy: thang
 * 1–5 chỉ có năm bậc, nên làm tròn 4,4 thành 4 là bỏ mất gần một phần tư dải giá
 * trị. Thang phần trăm thì một phần lẻ không thêm thông tin gì.
 */
export function computeReviewRating(
  ratings: readonly number[],
  config: IReviewRatingConfig,
): IRatingSnapshot {
  const samples = ratings.length;
  if (samples < config.minSamples) return { average: null, samples };

  const total = ratings.reduce((sum, value) => sum + value, 0);

  return { average: Math.round((total / samples) * 10) / 10, samples };
}
