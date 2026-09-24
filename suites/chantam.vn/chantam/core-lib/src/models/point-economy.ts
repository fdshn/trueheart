/**
 * Các con số của vòng đời điểm mà Admin chỉnh được lúc chạy (F40, F74).
 *
 * Tất cả đều là cấu hình động chứ không phải hằng trong code: đây đúng là loại
 * số cần chỉnh theo dữ liệu thật sau vài tuần chạy, và chờ một lần deploy để
 * đổi một con số là lý do người ta bỏ hẳn việc đổi.
 */

/** Khoá `system_configs` cho tỷ lệ quy đổi điểm ↔ VNĐ (F74). */
export const PointRedemptionConfigKey = 'point.redemption';

export interface IPointRedemptionConfig {
  /**
   * Bao nhiêu VNĐ ứng với một điểm khi ĐỔI vật phẩm.
   *
   * Giá trị tham khảo do người tặng khai, chia cho số này, ra số điểm cần có.
   * Khai khống chỉ làm vật phẩm đắt hơn — tức khó đổi hơn — nên không cần hàng
   * rào chống khai khống ở chiều này.
   */
  readonly vndPerPoint: number;
}

/**
 * 2.000 VNĐ/điểm.
 *
 * Suy ra từ `GIFT_COMPLETED = 56`: một món khai 1.000.000 VNĐ cần 500 điểm,
 * tức khoảng **9 lượt trao hoàn tất ở mức 100%**. Con số này chọn theo câu hỏi
 * trả lời được — "tặng bao nhiêu món thì đổi được một món tương đương" — chứ
 * không phải theo cảm giác về giá trị một điểm.
 */
export const DefaultPointRedemptionConfig: IPointRedemptionConfig = {
  vndPerPoint: 2000,
};

/** Trần trên để một giá trị gõ nhầm không biến mọi vật phẩm thành miễn phí. */
export const MaxVndPerPoint = 1_000_000;

export function normalizePointRedemptionConfig(
  raw: unknown,
): IPointRedemptionConfig {
  if (!raw || typeof raw !== 'object') return DefaultPointRedemptionConfig;

  const rate = Number((raw as Record<string, unknown>).vndPerPoint);
  if (!Number.isFinite(rate)) return DefaultPointRedemptionConfig;

  // Tối thiểu 1: `vndPerPoint = 0` là chia cho không, và mọi vật phẩm thành
  // vô hạn điểm hoặc miễn phí tuỳ hướng làm tròn.
  return {
    vndPerPoint: Math.min(MaxVndPerPoint, Math.max(1, Math.trunc(rate))),
  };
}

/** Khoá `system_configs` cho nhánh "người nhận không đánh giá" (F40). */
export const ReviewGraceConfigKey = 'review.grace';

export interface IReviewGraceConfig {
  /**
   * Chờ bao nhiêu ngày sau khi lượt trao hoàn tất rồi mới áp mức mặc định.
   *
   * Phần lớn người nhận sẽ nhận đồ rồi biến mất. Cho 0 điểm là phạt người tặng
   * vì việc của người khác; cho thẳng 100% thì người nhận có động cơ *không*
   * đánh giá để giúp người tặng, và chỉ số accuracy mất nghĩa.
   */
  readonly graceDays: number;
  /**
   * Mức phần trăm áp khi hết hạn mà vẫn không có đánh giá.
   *
   * **KHÔNG tính vào mẫu Giver Accuracy.** Nó là giá trị hệ thống tự điền,
   * không phải ý kiến của người thật; trộn vào thì chỉ số accuracy chỉ còn
   * phản ánh có bao nhiêu người lười đánh giá.
   */
  readonly defaultAccuracyPercent: number;
}

/**
 * 7 ngày, 80%.
 *
 * 7 ngày khớp với nhịp countdown chọn người nhận đã có trong sản phẩm, nên
 * người dùng chỉ phải nhớ một khoảng thời gian.
 *
 * 80% nằm giữa hai cực: thấp hơn 100 nên không thưởng cho việc im lặng, và cao
 * hơn ngưỡng gắn cờ (75) nên một lượt không được đánh giá không bao giờ tự nó
 * kéo ai vào diện Admin xem xét.
 */
export const DefaultReviewGraceConfig: IReviewGraceConfig = {
  graceDays: 7,
  defaultAccuracyPercent: 80,
};

/** Trần trên để cấu hình sai không treo điểm của người tặng vĩnh viễn. */
export const MaxReviewGraceDays = 90;

export function normalizeReviewGraceConfig(raw: unknown): IReviewGraceConfig {
  if (!raw || typeof raw !== 'object') return DefaultReviewGraceConfig;

  const source = raw as Record<string, unknown>;
  const days = Number(source.graceDays);
  const percent = Number(source.defaultAccuracyPercent);

  if (!Number.isFinite(days) || !Number.isFinite(percent))
    return DefaultReviewGraceConfig;

  return {
    // 0 ngày hợp lệ: nghĩa là cộng điểm ngay, không chờ đánh giá.
    graceDays: Math.min(MaxReviewGraceDays, Math.max(0, Math.trunc(days))),
    defaultAccuracyPercent: Math.min(100, Math.max(0, Math.trunc(percent))),
  };
}
