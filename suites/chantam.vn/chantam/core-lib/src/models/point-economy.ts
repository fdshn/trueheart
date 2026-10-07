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

/**
 * Khoá cấu hình: trần giá trị dùng để tính `value_bonus`, đơn vị VNĐ.
 *
 * ## Vì sao phải có trần
 *
 * CHỐT-14 đưa GIÁ NGƯỜI TẶNG TỰ KHAI vào công thức tính điểm. Trước 07/10 thiết kế
 * cố ý loại giá đó ra, với lý do ghi thẳng trong mã: đó là chỗ chặn khai khống để cày
 * điểm. Bỏ trần thì số học như sau — `estimated_value` trần 1.000.000.000đ,
 * `vndPerPoint` 2.000, nên MỘT lượt trao in ra 500.000 điểm, bằng 279 lần ngưỡng Kim
 * Cương (1.792). Không cần khai trần: 5.000.000đ cho một laptop cũ đã ra 2.500 điểm,
 * tức vượt Kim Cương bằng một giao dịch. Hai người thông đồng — một khai giá, một chấm
 * 100% — in được điểm không giới hạn.
 *
 * Trần này CẮT phần giá vượt ngưỡng, không từ chối bài: người tặng vẫn khai giá thật
 * cho việc đổi điểm và hiển thị, chỉ phần quy ra thưởng bị chặn.
 *
 * ## Vì sao là khoá SỐ NGUYÊN, không phải JSON
 *
 * Endpoint ghi cấu hình chung hiện chỉ nhận `INTEGER`, nên một khoá JSON sẽ chỉ sửa
 * được bằng SQL tay — đúng thứ "cấu hình động" sinh ra để tránh. Và phải thêm khoá này
 * vào `SupportedSystemConfigKeys`: thiếu đó thì nó nằm trong `system_configs` mà Admin
 * không chạm tới được.
 */
export const GiftValueBonusMaxValueConfigKey =
  'point.value_bonus_max_value_vnd';

/**
 * 2.000.000đ.
 *
 * Với `vndPerPoint` 2.000 thì trần này cho tối đa 1.000 điểm một lượt — dưới ngưỡng
 * Kim Cương (1.792), nên không ai lên hạng cao nhất bằng một giao dịch tự khai giá.
 * Đồng thời đủ rộng để phần lớn vật phẩm thật được quy đổi trọn giá trị.
 */
export const DefaultGiftValueBonusMaxValueVnd = 2_000_000;

export interface IGiftValueBonusInput {
  /** Giá người tặng khai. `null` hoặc <= 0 nghĩa là không có gì để quy ra điểm. */
  readonly estimatedValueVnd: number | null;
  /** Tỷ lệ quy đổi Admin cấu hình, lấy từ `point.redemption`. */
  readonly vndPerPoint: number;
  /** Mức chính xác CHỐT — người nhận chấm, hoặc mức mặc định khi hết hạn. */
  readonly accuracyPercent: number;
  /** Trần giá trị, lấy từ `GiftValueBonusMaxValueConfigKey`. */
  readonly maxValueVnd: number;
}

export interface IGiftValueBonus {
  /** Số điểm thưởng theo giá trị. Luôn >= 0. */
  readonly points: number;
  /** Giá trị thực sự dùng để tính, sau khi áp trần. Ghi vào `reason` để tra ngược. */
  readonly appliedValueVnd: number;
  /** `true` khi trần đã cắt bớt giá khai. */
  readonly capped: boolean;
}

/**
 * `value_bonus` theo CHỐT-14.
 *
 * ```text
 * applied_value    = min(estimated_value_vnd, max_value_vnd)
 * value_max_points = round_half_up(applied_value / vnd_per_point)
 * value_bonus      = round_half_up(value_max_points * accuracy_percent / 100)
 * ```
 *
 * Làm tròn HAI lần là đúng đặc tả, không phải nhầm: CHỐT-14 viết
 * `round_half_up(round_half_up(...) * ... / 100)`. Gộp thành một lượt làm tròn cho kết
 * quả khác ở những giá trị sát mốc, và đặc tả đã chọn cách này.
 *
 * `Math.round` của JavaScript là nửa-lên với SỐ DƯƠNG, đúng điều đặc tả đòi. Mọi đầu
 * vào ở đây đã kẹp về >= 0 nên không rơi vào bẫy `Math.round(-0.5) === -0`.
 */
export function computeGiftValueBonus(
  input: IGiftValueBonusInput,
): IGiftValueBonus {
  const declared =
    typeof input.estimatedValueVnd === 'number' &&
    Number.isFinite(input.estimatedValueVnd)
      ? Math.max(0, input.estimatedValueVnd)
      : 0;
  const cap = Number.isFinite(input.maxValueVnd)
    ? Math.max(0, input.maxValueVnd)
    : 0;
  const appliedValueVnd = Math.min(declared, cap);
  const capped = declared > cap;

  // Tỷ lệ 0 hoặc rác thì không chia được. Trả 0 chứ KHÔNG ném: job đối soát chạy qua
  // hàng trăm lượt trao, và một cấu hình hỏng không được làm nó dừng giữa danh sách.
  if (!Number.isFinite(input.vndPerPoint) || input.vndPerPoint <= 0)
    return { points: 0, appliedValueVnd, capped };

  const percent = Number.isFinite(input.accuracyPercent)
    ? Math.min(100, Math.max(0, input.accuracyPercent))
    : 0;

  const valueMaxPoints = Math.round(appliedValueVnd / input.vndPerPoint);
  return {
    points: Math.round((valueMaxPoints * percent) / 100),
    appliedValueVnd,
    capped,
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

/**
 * **Nguồn tính hạng là SỐ DƯ, chốt cứng trong code — 02/10.**
 *
 * Trước đó đây là một cấu hình động `rank.points_source` với hai giá trị
 * `BALANCE`/`LIFETIME`, cộng một khoá trong `system_configs`, một hàm chuẩn hoá,
 * một nhánh trong `rank.repository`, một nhánh trong `redemption-quote`, và hai
 * trường `rankPoints`/`rankPointsSource` trong response.
 *
 * Gỡ hết vì ba lý do, theo thứ tự quan trọng:
 *
 * 1. `BR-POINT-06` và `BR-PROF-RANK-06` của SRS **cùng nói** hạng dùng số dư hiện
 *    tại và *"Phase 1 không dùng một lifetime rank point riêng"*. Một cái núm bật
 *    được thứ đặc tả cấm là một cái núm không nên tồn tại.
 * 2. Núm đó **không bật được qua đường chính thức**: `rank.points_source` chưa bao
 *    giờ nằm trong `SupportedSystemConfigKeys`, nên `POST /admin/system-configs`
 *    từ chối nó và chỉ `UPDATE` SQL tay mới đổi được. Nó là một nhánh chết mang
 *    hình dạng một tính năng — đúng loại đã bắt ở `canViewExactLocation` (25).
 * 3. Hai trường trong response thì **nói sai với client**: mô tả của chúng dạy
 *    client đọc `rankPoints` thay vì `balancePoints` "vì cấu hình có thể đổi", mà
 *    cấu hình thì không đổi được.
 *
 * Nay chỉ còn MỘT con số quyết hạng: `balancePoints`. Muốn đổi lại thành tích luỹ
 * thì đó là một quyết định sản phẩm có migration riêng, không phải một dòng config.
 */

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
/**
 * `rule_code` của một lần Admin tự cộng/trừ điểm (`POST /admin/points/adjust`).
 *
 * KHÔNG có hàng nào trong `point_rules` mang mã này, và đó là cố ý:
 * `appendAdjustment` nhận số điểm truyền vào chứ không tra bảng, nên mã ở đây
 * chỉ để **phân loại khi đọc sổ**. Nhờ vậy lọc ra mọi can thiệp thủ công là một
 * mệnh đề `rule_code = 'ADMIN_ADJUSTMENT'`, không phải suy từ `source`.
 */
export const AdminPointAdjustmentRuleCode = 'ADMIN_ADJUSTMENT';

/**
 * Trần cho TRỊ TUYỆT ĐỐI một lần Admin điều chỉnh.
 *
 * Không phải hàng rào chống Admin xấu — người có `point.adjust` gọi mười lần là
 * xong. Nó chặn **lỗi gõ**: thêm một số 0 vào `5000` là phát ra số điểm nhiều
 * hơn toàn hệ thống cộng lại, và `point_ledger` chỉ ghi thêm nên dọn một bút
 * toán như vậy là ghi thêm một bút toán ngược rồi sống chung với cả hai dòng
 * trong lịch sử của người dùng đó mãi mãi.
 *
 * 100.000 điểm ở tỷ lệ 2.000 VNĐ/điểm là 200 triệu VNĐ — đủ rộng cho mọi lần
 * bù đắp có thật, đủ chặt để một lần gõ nhầm không thành sự cố.
 */
export const MaxAdminPointAdjustmentDelta = 100_000;

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

/**
 * Bậc hạng mà một số điểm rơi vào, chỉ xét theo NGƯỠNG.
 *
 * Dùng cho phần xem trước "đổi món này có làm tôi tụt hạng không". Hàm thuần, nhận
 * bảng ngưỡng làm tham số — bảng đó là cấu hình động và sẽ còn đổi.
 *
 * **Chỉ dự đoán chiều XUỐNG.** Tiêu điểm không bao giờ đẩy ai lên hạng, nên ở đây
 * không cần tới những cửa phụ mà việc thăng hạng phải qua (số lượt trao đã hoàn
 * tất, số lượt giới thiệu hợp lệ). Dùng hàm này để đoán chiều lên là sai.
 */
export function rankForPoints(
  points: number,
  tiers: readonly { rank: string; thresholdPoints: number }[],
): string | null {
  let landed: { rank: string; thresholdPoints: number } | null = null;

  for (const tier of tiers)
    if (
      points >= tier.thresholdPoints &&
      (landed === null || tier.thresholdPoints > landed.thresholdPoints)
    )
      landed = tier;

  return landed?.rank ?? null;
}
