/**
 * Dự án từ thiện 4 giai đoạn — đợt 4b (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.9, §3.16):
 * điểm theo giá trị kèm trần (hoãn chứ không bỏ) và khiếu nại hai tầng.
 */

// ── Điểm ────────────────────────────────────────────────────────────────────

/** Rule gốc có award và trần riêng — cũng là các rule được hưởng hệ số thưởng chiến dịch. */
export const CharityPointBaseRuleCodes = [
  'CHARITY_ITEM_VALUE',
  'CHARITY_POST_VIDEO',
  'CHARITY_POST_IMAGE',
  'CHARITY_PARTICIPATION',
  // Ủng hộ tiền (CR 25/11/2026): cộng một lần khi dự án kết thúc — xem charity-money-pledge.ts.
  'CHARITY_MONEY_PLEDGE',
] as const;
export type CharityPointBaseRuleCode =
  (typeof CharityPointBaseRuleCodes)[number];

/**
 * Mọi mã của `campaign_point_awards`: bốn rule gốc + `CHARITY_CAMPAIGN_BONUS` (CR 22/11/2026) —
 * award thưởng đi cặp với award gốc qua `base_award_id`, tính chung trần của rule gốc.
 */
export const CharityPointRuleCodes = [
  ...CharityPointBaseRuleCodes,
  'CHARITY_CAMPAIGN_BONUS',
] as const;
export type CharityPointRuleCode = (typeof CharityPointRuleCodes)[number];

export const CharityCampaignBonusRuleCode = 'CHARITY_CAMPAIGN_BONUS' as const;

/** Hệ số tăng điểm của chiến dịch (%), Admin chốt khi duyệt. */
export const CharityPointBonusPercents = [0, 20, 50, 100] as const;
export type CharityPointBonusPercent =
  (typeof CharityPointBonusPercents)[number];

export function isCharityPointBonusPercent(
  value: unknown,
): value is CharityPointBonusPercent {
  return (CharityPointBonusPercents as readonly unknown[]).includes(value);
}

/** Điểm thưởng cho phần điểm gốc vừa ghi: `floor(gốc × % / 100)`, không âm. */
export function bonusPoints(baseApplied: number, percent: number): number {
  if (baseApplied <= 0 || percent <= 0) return 0;
  return Math.floor((baseApplied * percent) / 100);
}

/**
 * Điểm gốc bị chấm lại (giảm): thưởng đã ghi co theo cùng tỉ lệ. Trả MỤC TIÊU mới của thưởng —
 * nơi gọi ghi phần chênh (âm) ngay.
 */
export function bonusAdjustmentTarget(input: {
  readonly bonusApplied: number;
  readonly baseAppliedBefore: number;
  readonly baseAppliedAfter: number;
}): number {
  if (input.baseAppliedBefore <= 0) return 0;
  return Math.max(
    0,
    Math.floor(
      (input.bonusApplied * Math.max(0, input.baseAppliedAfter)) /
        input.baseAppliedBefore,
    ),
  );
}

/** 10.000đ giá trị xác nhận = `point_rules.points` điểm (bảng Product: 1 điểm). */
export const CharityItemValueUnitVnd = 10_000;

export const CharityPointCapWindows = ['daily', 'project', 'cycle'] as const;
export type CharityPointCapWindow = (typeof CharityPointCapWindows)[number];

/** Khoá cấu hình trần: `charity.points_cap.<rule>.<cửa sổ>` — 0 = không trần. */
export function charityPointCapConfigKey(
  rule: CharityPointBaseRuleCode,
  window: CharityPointCapWindow,
): string {
  return `charity.points_cap.${rule.toLowerCase()}.${window}`;
}

export const CharityPointCapConfigKeys: readonly string[] =
  CharityPointBaseRuleCodes.flatMap((rule) =>
    CharityPointCapWindows.map((window) =>
      charityPointCapConfigKey(rule, window),
    ),
  );

/** Giá trị cấu hình nguyên không âm; hỏng/thiếu thì `fallback`. */
export function normalizeNonNegativeInt(
  value: unknown,
  fallback: number,
  max = 1_000_000_000,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export function itemValuePoints(
  confirmedValueVnd: number,
  rulePoints: number,
): number {
  if (confirmedValueVnd <= 0 || rulePoints <= 0) return 0;
  return Math.floor(confirmedValueVnd / CharityItemValueUnitVnd) * rulePoints;
}

/**
 * Ảnh/clip: mức của rule × số tệp hợp lệ (chốt 05/11: 3 điểm/clip, 2 điểm/ảnh — như nhau cho
 * mọi người đăng, không còn hệ số theo vai).
 */
export function postMediaPoints(input: {
  readonly mediaCount: number;
  readonly rulePoints: number;
}): number {
  if (input.mediaCount <= 0 || input.rulePoints <= 0) return 0;
  return input.mediaCount * input.rulePoints;
}

/** Tham gia: `point_rules.points` (Product: 100) × mức hoàn thành / 100. */
export function participationPoints(
  completionScore: number,
  rulePoints: number,
): number {
  if (completionScore <= 0 || rulePoints <= 0) return 0;
  return Math.round((rulePoints * completionScore) / 100);
}

/**
 * Phần được ghi NGAY của một khoản dương, theo trần còn lại của từng cửa sổ (`null` = không
 * trần). Phần còn lại là HOÃN — không bỏ, ghi tiếp khi trần có chỗ (ngày mới, Admin nâng trần).
 */
export function allowedUnderCaps(
  wanted: number,
  windows: readonly { cap: number | null; used: number }[],
): number {
  let allowed = Math.max(0, wanted);
  for (const window of windows)
    if (window.cap !== null)
      allowed = Math.min(allowed, Math.max(0, window.cap - window.used));
  return allowed;
}

// ── Khiếu nại (§3.16) ───────────────────────────────────────────────────────

export const CharityAppealTargetTypes = ['EVALUATION', 'ITEM_VALUE'] as const;
export type CharityAppealTargetType = (typeof CharityAppealTargetTypes)[number];

export const CharityAppealStatuses = [
  /** Tầng 1: ban tổ chức đang xem. */
  'ORGANIZER_REVIEW',
  /** Ban tổ chức đã quyết (điều chỉnh / giữ nguyên) — chờ người khiếu nại chấp nhận hay chuyển tầng 2. */
  'AWAITING_APPELLANT',
  /** Tầng 2: Admin quyết cuối. */
  'ADMIN_REVIEW',
  'CLOSED',
] as const;
export type CharityAppealStatus = (typeof CharityAppealStatuses)[number];

export const CharityAppealOutcomes = [
  'ADJUSTED_ACCEPTED',
  'KEPT_ACCEPTED',
  'AUTO_CLOSED',
  'ADMIN_KEPT',
  'ADMIN_ADJUSTED',
  'ADMIN_REJECTED',
] as const;
export type CharityAppealOutcome = (typeof CharityAppealOutcomes)[number];

export const CharityAppealWindowDaysConfigKey = 'charity.appeal_window_days';
export const CharityAppealOrganizerSlaDaysConfigKey =
  'charity.appeal_organizer_sla_days';
export const CharityAppealAutoCloseDaysConfigKey =
  'charity.appeal_auto_close_days';
/** Chốt §7.8: N = 7, M = 3, K = 3. */
export const DefaultCharityAppealWindowDays = 7;
export const DefaultCharityAppealOrganizerSlaDays = 3;
export const DefaultCharityAppealAutoCloseDays = 3;
/** Chống lạm dụng: số khiếu nại mới tối đa của một người trong 24 giờ. */
export const MaxCharityAppealsPerDay = 5;

export type CharityAppealAction =
  | 'ORGANIZER_ADJUST'
  | 'ORGANIZER_KEEP'
  | 'APPELLANT_ACCEPT'
  | 'APPELLANT_ESCALATE'
  | 'ADMIN_KEEP'
  | 'ADMIN_ADJUST'
  | 'ADMIN_REJECT'
  | 'ADMIN_REOPEN';

/** Bước hợp lệ từ mỗi trạng thái — một bảng thay vì `if` rải rác. */
export const CharityAppealTransitions: Readonly<
  Record<CharityAppealAction, CharityAppealStatus>
> = {
  ORGANIZER_ADJUST: 'ORGANIZER_REVIEW',
  ORGANIZER_KEEP: 'ORGANIZER_REVIEW',
  APPELLANT_ACCEPT: 'AWAITING_APPELLANT',
  APPELLANT_ESCALATE: 'AWAITING_APPELLANT',
  ADMIN_KEEP: 'ADMIN_REVIEW',
  ADMIN_ADJUST: 'ADMIN_REVIEW',
  ADMIN_REJECT: 'ADMIN_REVIEW',
  ADMIN_REOPEN: 'CLOSED',
};

/** Giá trị đem khiếu nại hợp lệ theo loại: điểm 0–100 hoặc VNĐ ≥ 0. */
export function isValidAppealValue(
  targetType: CharityAppealTargetType,
  value: number,
): boolean {
  if (!Number.isInteger(value) || value < 0) return false;
  return targetType === 'EVALUATION'
    ? value <= 100
    : value <= 1_000_000_000_000;
}
