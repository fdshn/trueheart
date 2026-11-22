/**
 * Dự án từ thiện — đợt 5b/5c, quyết định Product 05/11 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md
 * §3.2, §3.4, §3.11, §3.18): hỗ trợ mở, nhiều đợt trao, checklist sẵn sàng trước 48 giờ, điều
 * kiện hoàn tất dự án.
 */

// ── Hỗ trợ mở (§3.11) ───────────────────────────────────────────────────────

export const CharitySupportTypes = [
  'TRANSPORT',
  'LABOR',
  'SKILL_SERVICE',
  'VENUE',
  'EQUIPMENT',
  'MEAL_ACCOMMODATION',
  'COMMUNICATION',
  'OTHER',
] as const;
export type CharitySupportType = (typeof CharitySupportTypes)[number];

export const CharitySupportTypeLabels: Readonly<
  Record<CharitySupportType, string>
> = {
  TRANSPORT: 'Chuyến xe, phương tiện',
  LABOR: 'Công sức, giờ công',
  SKILL_SERVICE: 'Kỹ năng, dịch vụ',
  VENUE: 'Địa điểm',
  EQUIPMENT: 'Thiết bị',
  MEAL_ACCOMMODATION: 'Suất ăn, chỗ nghỉ',
  COMMUNICATION: 'Truyền thông',
  OTHER: 'Khác',
};

/** Một lần một người nhận hỗ trợ một phần hạng mục — được nhiều lần, nhiều hạng mục. */
export const CharitySupportOfferStatuses = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'COMPLETED',
  'WITHDRAWN',
] as const;
export type CharitySupportOfferStatus =
  (typeof CharitySupportOfferStatuses)[number];

export const CharitySupportOfferDecisions = [
  'ACCEPT',
  'REJECT',
  'COMPLETE',
] as const;
export type CharitySupportOfferDecision =
  (typeof CharitySupportOfferDecisions)[number];

export const CharitySupportOfferDecisionRules: Readonly<
  Record<
    CharitySupportOfferDecision,
    {
      readonly to: CharitySupportOfferStatus;
      readonly from: readonly CharitySupportOfferStatus[];
    }
  >
> = {
  ACCEPT: { to: 'ACCEPTED', from: ['PENDING'] },
  REJECT: { to: 'REJECTED', from: ['PENDING', 'ACCEPTED'] },
  COMPLETE: { to: 'COMPLETED', from: ['ACCEPTED'] },
};

/** Người hỗ trợ rút lại được khi chưa hoàn thành. */
export const CharitySupportOfferWithdrawableStatuses: readonly CharitySupportOfferStatus[] =
  ['PENDING', 'ACCEPTED'];

// ── Điều kiện hoàn tất dự án (§3.18) ────────────────────────────────────────

/** Lý do chưa được công khai tổng kết (hoàn tất dự án) — trả về cho BTC sửa từng cái. */
export const CharityCompletionBlockers = [
  'CONTRIBUTIONS_PENDING',
  'CONTRIBUTIONS_DISPUTED',
  'DELIVERIES_UNSETTLED',
  'NEEDS_OPEN',
  'SURPLUS_UNEXPLAINED',
  'FINANCIAL_STATEMENT_MISSING',
  'APPEALS_OPEN',
  'SUPPORT_OFFERS_UNSETTLED',
] as const;
export type CharityCompletionBlocker =
  (typeof CharityCompletionBlockers)[number];

export const CharityCompletionBlockerLabels: Readonly<
  Record<CharityCompletionBlocker, string>
> = {
  CONTRIBUTIONS_PENDING: 'còn đề nghị đóng góp chưa xử lý',
  CONTRIBUTIONS_DISPUTED: 'còn tranh chấp đóng góp chưa giải quyết',
  DELIVERIES_UNSETTLED: 'còn lượt giao nhận chưa hoàn tất hoặc huỷ',
  NEEDS_OPEN: 'còn hạng mục nhu cầu đang mở',
  SURPLUS_UNEXPLAINED: 'còn phần dư chưa giải trình',
  FINANCIAL_STATEMENT_MISSING: 'có nhận tiền mà chưa có báo cáo kèm sao kê',
  APPEALS_OPEN: 'còn khiếu nại chưa đóng',
  SUPPORT_OFFERS_UNSETTLED: 'còn đề nghị hỗ trợ chưa xử lý xong',
};

// ── Tranh chấp đóng góp (§3.18) ─────────────────────────────────────────────

/**
 * Lý do mở tranh chấp về một đóng góp đã được chấp nhận — hai bên không thống nhất về việc
 * giao nhận. Khác khiếu nại (§3.16, chỉ mức hoàn thành / giá trị xác nhận, đi tầng BTC → Admin).
 */
export const CharityDisputeReasons = [
  'NOT_DELIVERED',
  'QUANTITY_MISMATCH',
  'QUALITY_ISSUE',
  'VALUE_MISMATCH',
  'OTHER',
] as const;
export type CharityDisputeReason = (typeof CharityDisputeReasons)[number];

export const CharityDisputeReasonLabels: Readonly<
  Record<CharityDisputeReason, string>
> = {
  NOT_DELIVERED: 'Chưa giao / chưa nhận được',
  QUANTITY_MISMATCH: 'Số lượng không khớp',
  QUALITY_ISSUE: 'Chất lượng / tình trạng không đúng',
  VALUE_MISMATCH: 'Giá trị ghi nhận không đúng',
  OTHER: 'Khác',
};

export const CharityDisputeStatuses = [
  'OPEN',
  'RESOLVED',
  'WITHDRAWN',
] as const;
export type CharityDisputeStatus = (typeof CharityDisputeStatuses)[number];

/** Bên mở tranh chấp. */
export const CharityDisputeParties = ['CONTRIBUTOR', 'ORGANIZER'] as const;
export type CharityDisputeParty = (typeof CharityDisputeParties)[number];

/** Đóng góp ở các trạng thái này mới tranh chấp được — đã có thoả thuận để mà lệch. */
export const CharityDisputableContributionStatuses = [
  'ACCEPTED',
  'PARTIALLY_ACCEPTED',
] as const;

// ── Độ dài clip (§3.5, chốt 05/11) ──────────────────────────────────────────

export const CharityPostMaxVideoSecondsConfigKey =
  'charity.post_max_video_seconds';
/**
 * 60 giây: vừa trần 25 MB của storage ở 720p (~2,5–3 Mbps), tải lên được bằng 3G/4G yếu ở
 * điểm trao vùng sâu, đúng thói quen xem tin ngắn. Admin chỉnh 10–600.
 */
export const DefaultCharityPostMaxVideoSeconds = 60;

export function normalizeCharityPostMaxVideoSeconds(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed)) return DefaultCharityPostMaxVideoSeconds;
  return Math.min(Math.max(parsed, 10), 600);
}
