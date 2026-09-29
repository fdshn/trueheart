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

/** Vì sao một vật phẩm KHÔNG đổi được bằng điểm. */
export type RedemptionBlockedReason =
  /** Bài không khai giá trị tham khảo, nên không có gì để quy ra điểm. */
  | 'NO_ESTIMATED_VALUE'
  /** Giá khai quá nhỏ so với tỷ lệ — quy ra 0 điểm. */
  | 'PRICE_BELOW_ONE_POINT';

export interface IRedemptionQuote {
  readonly redeemable: boolean;
  /** Số điểm cần có. `0` khi không đổi được. */
  readonly points: number;
  readonly reason: RedemptionBlockedReason | null;
}

/**
 * Quy giá trị tham khảo (VNĐ) ra số điểm cần để đổi thẳng vật phẩm (F74).
 *
 * Hàm thuần: cùng một giá với cùng một tỷ lệ luôn ra cùng một số điểm, và mọi
 * ranh giới kiểm được bằng bảng đầu vào/đầu ra. Tỷ lệ truyền vào chứ không đọc
 * từ đâu cả — nó là cấu hình động và sẽ còn đổi.
 *
 * **Làm tròn LÊN.** 1.500 VNĐ với tỷ lệ 1.000 ra 2 điểm chứ không phải 1: làm
 * tròn xuống là bán món đồ rẻ hơn giá người tặng khai, và chênh lệch đó nhân với
 * số lượt đổi là một khoản thất thoát không ai theo dõi.
 */
export function quoteRedemption(
  estimatedValueVnd: number | null | undefined,
  config: IPointRedemptionConfig = DefaultPointRedemptionConfig,
): IRedemptionQuote {
  const value = Number(estimatedValueVnd);

  // Không khai giá thì KHÔNG đổi được, chứ không phải đổi miễn phí. Giá trị là
  // thứ người tặng tự điền, và bỏ trống không có nghĩa là cho không.
  if (!Number.isFinite(value) || value <= 0)
    return { redeemable: false, points: 0, reason: 'NO_ESTIMATED_VALUE' };

  const points = Math.ceil(value / config.vndPerPoint);

  // Món rẻ tới mức quy ra 0 điểm: đổi được mà không mất gì là một lỗ hổng, không
  // phải một ưu đãi. `Math.ceil` đã chặn hầu hết, nhưng giữ nhánh này để ý đồ
  // đọc được và để một tỷ lệ tương lai lớn bất thường không lọt qua.
  if (points <= 0)
    return { redeemable: false, points: 0, reason: 'PRICE_BELOW_ONE_POINT' };

  return { redeemable: true, points, reason: null };
}

/** Khoá `system_configs` cho việc xét hạng đọc cột điểm nào. */
export const RankPointsSourceConfigKey = 'rank.points_source';

/**
 * Xét hạng dựa trên cột điểm nào.
 *
 * Hai cột nói hai chuyện khác nhau, và chọn sai là đổi hẳn ý nghĩa của thứ hạng:
 *
 * - `BALANCE` — điểm **tiêu được**, kẹp ở 0. Tiêu điểm đổi vật phẩm làm tụt
 *   hạng, và khoản phạt (ví dụ `SHIP_UNPAID_PENALTY` −50) cũng làm tụt hạng.
 *   Hạng ở đây là "đang giữ bao nhiêu", giống số dư tài khoản.
 * - `LIFETIME` — điểm **tích luỹ**, chỉ tăng. Thứ hạng là bằng ghi nhận những
 *   gì đã đóng góp, và không ai mất hạng vì đã tiêu điểm mình kiếm được.
 *
 * Để Admin chọn thay vì chốt cứng vì đây là quyết định sản phẩm, không phải
 * quyết định kỹ thuật — và nó đã bị đổi qua lại một lần (2026-09-24).
 */
export type RankPointsSource = 'BALANCE' | 'LIFETIME';

export interface IRankPointsSourceConfig {
  readonly source: RankPointsSource;
}

/**
 * Mặc định `BALANCE` — giữ NGUYÊN hành vi đang chạy.
 *
 * Một cấu hình mới không được lặng lẽ đổi thứ hạng của tất cả mọi người ngay
 * lúc deploy; đổi là việc Admin làm có chủ ý, và lúc đó họ biết mình vừa làm gì.
 */
export const DefaultRankPointsSourceConfig: IRankPointsSourceConfig = {
  source: 'BALANCE',
};

export function normalizeRankPointsSourceConfig(
  raw: unknown,
): IRankPointsSourceConfig {
  if (!raw || typeof raw !== 'object') return DefaultRankPointsSourceConfig;

  const source = (raw as Record<string, unknown>).source;
  // Giá trị lạ thì lùi về mặc định chứ không ném: một dòng cấu hình gõ sai
  // không được làm chết cả vòng xét hạng của mọi người.
  return source === 'LIFETIME' || source === 'BALANCE'
    ? { source }
    : DefaultRankPointsSourceConfig;
}

/** Khoá `system_configs` cho hạn lưu trữ thông báo. */
export const NotificationRetentionConfigKey = 'notification.retention';

export interface INotificationRetentionConfig {
  readonly retentionDays: number;
}

/**
 * 90 ngày.
 *
 * Thông báo mang tiêu đề bài, tên người và **đoạn đầu tin nhắn chat**. Giữ mãi
 * nghĩa là xoá lịch sử chat theo hạn xong, một bản sao của chính những câu đó
 * vẫn nằm trong hộp thư — tức chính sách lưu trữ có một lỗ thủng ở chỗ không ai
 * nhìn vào.
 *
 * 90 ngày dài hơn mọi chu kỳ nghiệp vụ đang có (đồng hồ chọn người 30 ngày, hạn
 * bài 3 tháng), nên không ai mất một thông báo còn đang cần.
 */
export const DefaultNotificationRetentionConfig: INotificationRetentionConfig =
  {
    retentionDays: 90,
  };

/** Trần trên để cấu hình sai không biến "dọn" thành "giữ mãi". */
export const MaxNotificationRetentionDays = 365;

export function normalizeNotificationRetentionConfig(
  raw: unknown,
): INotificationRetentionConfig {
  if (!raw || typeof raw !== 'object')
    return DefaultNotificationRetentionConfig;

  const days = Number((raw as Record<string, unknown>).retentionDays);
  if (!Number.isFinite(days)) return DefaultNotificationRetentionConfig;

  return {
    // Tối thiểu 7: dưới một tuần thì người đi vắng vài ngày về sẽ thấy hộp thư
    // trống và không biết mình đã bỏ lỡ gì.
    retentionDays: Math.min(
      MaxNotificationRetentionDays,
      Math.max(7, Math.trunc(days)),
    ),
  };
}

/**
 * Nhắc bài sắp hết hạn trước bao nhiêu ngày.
 *
 * Bảy ngày khớp với nhịp đồng hồ chọn người nhận đã có trong sản phẩm, nên
 * người dùng chỉ phải nhớ một khoảng thời gian. Đủ để họ kịp bấm gia hạn, và
 * chưa xa tới mức nhắc xong rồi quên.
 */
export const PostExpiryReminderDays = 7;

/**
 * Những rule mà chạm trần ngày nghĩa là **HOÃN**, không phải mất.
 *
 * Phân biệt này là nội dung nghiệp vụ, không phải chi tiết kỹ thuật:
 *
 * - **Hành động LẶP được** — bình luận, cảm xúc, báo xấu được xử lý. Trần ngày
 *   ở đây chính là hàng rào chống cày điểm. Câu bình luận thứ mười một không
 *   sinh điểm, và trả bù nó hôm sau là vô hiệu hoá hàng rào: người ta chỉ cần
 *   gõ thoải mái rồi chờ hệ thống tự rót dần.
 *
 * - **MỐC một-lần** — một lượt trao hoàn tất, một lượt giới thiệu hợp lệ, xác
 *   minh số điện thoại, hoàn tất onboarding. Sự kiện chỉ xảy ra đúng một lần
 *   trong đời và đã xảy ra thật. Trần ngày ở đây chỉ để chặn hai tài khoản trao
 *   qua trao lại cả ngày; nó không có nghĩa "việc này không đáng thưởng". Mất
 *   vĩnh viễn là phạt người tặng thứ sáu trong ngày vì họ hào phóng.
 *
 * Danh sách này là cái mà `point:reconcile` và `gift:settle-rewards` dựa vào để
 * quyết định có quét lại hay không.
 */
export const RetryablePointRuleCodes = [
  'GIFT_COMPLETED_GIVER',
  'GIFT_COMPLETED_RECEIVER',
  'REFERRAL_QUALIFIED',
  'PHONE_VERIFIED_FIRST_TIME',
  'ONBOARDING_COMPLETED',
] as const;

export type RetryablePointRuleCode = (typeof RetryablePointRuleCodes)[number];

export function isRetryablePointRule(ruleCode: string): boolean {
  return (RetryablePointRuleCodes as readonly string[]).includes(ruleCode);
}
