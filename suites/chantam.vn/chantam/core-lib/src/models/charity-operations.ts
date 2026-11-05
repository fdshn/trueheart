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

// ── Đợt trao (§3.18) ────────────────────────────────────────────────────────

export const CharityRoundStatuses = ['PLANNED', 'DONE', 'CANCELLED'] as const;
export type CharityRoundStatus = (typeof CharityRoundStatuses)[number];

export const CharityRoundReadinessStatuses = [
  'PENDING',
  'READY',
  'NOT_READY',
] as const;
export type CharityRoundReadiness =
  (typeof CharityRoundReadinessStatuses)[number];

/** Checklist trước 48 giờ của mỗi đợt trao (§3.4) — thiếu thì CẢNH BÁO, không chặn. */
export const CharityRoundChecklistKeys = [
  'TRANSPORT',
  'GOODS_PACKED',
  'LOCAL_AUTHORITY',
  'RECIPIENT_LIST',
  'TEAM_BRIEFED',
  'BUDGET',
] as const;
export type CharityRoundChecklistKey =
  (typeof CharityRoundChecklistKeys)[number];

export const CharityRoundChecklistLabels: Readonly<
  Record<CharityRoundChecklistKey, string>
> = {
  TRANSPORT: 'Xe, phương tiện đã chốt',
  GOODS_PACKED: 'Quà đã đóng gói, kiểm đếm',
  LOCAL_AUTHORITY: 'Đã báo địa phương',
  RECIPIENT_LIST: 'Danh sách người nhận đã chốt',
  TEAM_BRIEFED: 'Đã phân công, dặn dò người tham gia',
  BUDGET: 'Kinh phí đợt trao đã sẵn',
};

export interface ICharityRoundChecklistItem {
  readonly key: CharityRoundChecklistKey;
  readonly done: boolean;
  readonly note: string | null;
}

/** Đủ các mục checklist, mục chưa có thì chưa xong. */
export function normalizeRoundChecklist(
  items: readonly Partial<ICharityRoundChecklistItem>[] | null | undefined,
): ICharityRoundChecklistItem[] {
  const byKey = new Map((items ?? []).map((item) => [item.key, item]));
  return CharityRoundChecklistKeys.map((key) => {
    const item = byKey.get(key);
    return {
      key,
      done: item?.done === true,
      note:
        typeof item?.note === 'string' && item.note.trim() ? item.note : null,
    };
  });
}

export const CharityRoundWarningCodes = [
  /** Còn ≤ 48 giờ mà ban tổ chức chưa xác nhận sẵn sàng. */
  'READINESS_NOT_CONFIRMED',
  /** Ban tổ chức báo CHƯA sẵn sàng. */
  'NOT_READY',
  /** Còn ≤ 48 giờ mà checklist chưa xong hết. */
  'CHECKLIST_INCOMPLETE',
] as const;
export type CharityRoundWarningCode = (typeof CharityRoundWarningCodes)[number];

export const CharityRoundWarningHours = 48;

/** Cảnh báo của một đợt trao — chỉ để BTC thấy, KHÔNG tự huỷ hay chặn sự kiện. */
export function charityRoundWarnings(input: {
  readonly status: CharityRoundStatus;
  readonly startsAt: Date;
  readonly readiness: CharityRoundReadiness;
  readonly checklist: readonly ICharityRoundChecklistItem[];
  readonly now: Date;
}): CharityRoundWarningCode[] {
  if (input.status !== 'PLANNED') return [];
  const warnings: CharityRoundWarningCode[] = [];
  if (input.readiness === 'NOT_READY') warnings.push('NOT_READY');
  const hoursLeft =
    (input.startsAt.getTime() - input.now.getTime()) / 3_600_000;
  if (hoursLeft > CharityRoundWarningHours) return warnings;
  if (input.readiness === 'PENDING') warnings.push('READINESS_NOT_CONFIRMED');
  if (input.checklist.some((item) => !item.done))
    warnings.push('CHECKLIST_INCOMPLETE');
  return warnings;
}

// ── Điều kiện hoàn tất dự án (§3.18) ────────────────────────────────────────

/** Lý do chưa được công khai tổng kết (hoàn tất dự án) — trả về cho BTC sửa từng cái. */
export const CharityCompletionBlockers = [
  'CONTRIBUTIONS_PENDING',
  'DELIVERIES_UNSETTLED',
  'NEEDS_OPEN',
  'SURPLUS_UNEXPLAINED',
  'FINANCIAL_STATEMENT_MISSING',
  'APPEALS_OPEN',
  'SUPPORT_OFFERS_UNSETTLED',
  'ROUNDS_UNSETTLED',
] as const;
export type CharityCompletionBlocker =
  (typeof CharityCompletionBlockers)[number];

export const CharityCompletionBlockerLabels: Readonly<
  Record<CharityCompletionBlocker, string>
> = {
  CONTRIBUTIONS_PENDING: 'còn đề nghị đóng góp chưa xử lý',
  DELIVERIES_UNSETTLED: 'còn lượt giao nhận chưa hoàn tất hoặc huỷ',
  NEEDS_OPEN: 'còn hạng mục nhu cầu đang mở',
  SURPLUS_UNEXPLAINED: 'còn phần dư chưa giải trình',
  FINANCIAL_STATEMENT_MISSING: 'có nhận tiền mà chưa có báo cáo kèm sao kê',
  APPEALS_OPEN: 'còn khiếu nại chưa đóng',
  SUPPORT_OFFERS_UNSETTLED: 'còn đề nghị hỗ trợ chưa xử lý xong',
  ROUNDS_UNSETTLED: 'còn đợt trao chưa ghi nhận xong hoặc huỷ',
};
