/**
 * Dự án từ thiện theo vòng đời 4 giai đoạn (docs/plan/CHARITY-PROJECT-LIFECYCLE.md).
 *
 * Mọi hằng số và phép tính THUẦN của dự án ở đây — cùng một định nghĩa cho use case, cho
 * job chuyển giai đoạn và cho test.
 */

/** Giai đoạn vận hành = 4 mục A/B/C/D trên app (chốt §7.1). */
export const CharityOperationStages = [
  'PLAN',
  'EXECUTION',
  'EVENT',
  'SUMMARY',
] as const;
export type CharityOperationStage = (typeof CharityOperationStages)[number];

/** Nhãn hiển thị của 4 mục (chốt §7.1) — đổi chữ không cần migration. */
export const CharityOperationStageLabels: Readonly<
  Record<CharityOperationStage, string>
> = {
  PLAN: 'Kế hoạch',
  EXECUTION: 'Triển khai',
  EVENT: 'Sự kiện trao',
  SUMMARY: 'Tổng kết',
};

export const CharityCallToActions = [
  'LIKE',
  'SUPPORT_AND_DONATE',
  'JOIN',
] as const;
export type CharityCallToAction = (typeof CharityCallToActions)[number];

export const CharityPartyRoles = [
  'ORGANIZER',
  'BENEFICIARY',
  'LICENSING',
  'MEDIA',
] as const;
export type CharityPartyRole = (typeof CharityPartyRoles)[number];

export const CharityBeneficiaryKinds = ['INDIVIDUAL', 'GROUP'] as const;
export type CharityBeneficiaryKind = (typeof CharityBeneficiaryKinds)[number];

export const CharityTeamRoles = [
  'GENERAL_LEAD',
  'LIAISON_MEDIA',
  'INTAKE_LOGISTICS',
  'FINANCE',
  'ADVANCE_TRANSPORT',
  'REPORTING',
] as const;
export type CharityTeamRole = (typeof CharityTeamRoles)[number];

/** Thứ tự là thứ tự thời gian bắt buộc của 4 bước. */
export const CharityPhaseKeys = [
  'PLANNING',
  'PREPARATION',
  'DISTRIBUTION',
  'REPORTING',
] as const;
export type CharityPhaseKey = (typeof CharityPhaseKeys)[number];

export const CharityDeliveryMethods = ['ON_SITE', 'SHIP', 'TRANSFER'] as const;
export type CharityDeliveryMethod = (typeof CharityDeliveryMethods)[number];

export const CharityReportModes = ['ONLINE', 'OFFLINE'] as const;
export type CharityReportMode = (typeof CharityReportModes)[number];

export const CharityItemConditions = ['NEW', 'USED', 'ANY', 'OTHER'] as const;
export type CharityItemCondition = (typeof CharityItemConditions)[number];

export const CharitySupplySources = ['PURCHASE', 'DONATION', 'MIXED'] as const;
export type CharitySupplySource = (typeof CharitySupplySources)[number];

export const CharityOpenClosed = ['OPEN', 'CLOSED'] as const;
export type CharityOpenClosedStatus = (typeof CharityOpenClosed)[number];

export const CharityVolunteerNeedStatuses = [
  'OPEN',
  'CLOSED',
  'STARTED',
] as const;
export type CharityVolunteerNeedStatus =
  (typeof CharityVolunteerNeedStatuses)[number];

export const CharityVolunteerRegistrationStatuses = [
  'REGISTERED',
  'CONFIRMED',
  'CANCELLED',
] as const;
export type CharityVolunteerRegistrationStatus =
  (typeof CharityVolunteerRegistrationStatuses)[number];

export const CharityCustomFieldTypes = [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATE',
  'SELECT',
  'CHECKBOX',
  'FILE',
  'URL',
] as const;
export type CharityCustomFieldType = (typeof CharityCustomFieldTypes)[number];

export const CharityFieldVisibilities = [
  'PUBLIC',
  'PARTICIPANT',
  'ORGANIZER_ONLY',
  'ADMIN_ONLY',
] as const;
export type CharityFieldVisibility = (typeof CharityFieldVisibilities)[number];

/** Trạng thái hoàn thiện một mục workspace. */
export const CharitySectionCompletionStatuses = [
  'EMPTY',
  'DRAFT',
  'READY',
  'PUBLISHED',
] as const;
export type CharitySectionCompletionStatus =
  (typeof CharitySectionCompletionStatuses)[number];

/** Khoá cấu hình: số tài khoản nhận tiền đang hiệu lực tối đa (chốt §7.4). */
export const CharityMaxBankAccountsConfigKey =
  'charity.max_bank_accounts_per_campaign';
export const DefaultCharityMaxBankAccounts = 2;

export function normalizeMaxBankAccounts(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 20
    ? value
    : DefaultCharityMaxBankAccounts;
}

const StageRank: Readonly<Record<CharityOperationStage, number>> = {
  PLAN: 0,
  EXECUTION: 1,
  EVENT: 2,
  SUMMARY: 3,
};

export function stageRank(stage: CharityOperationStage): number {
  return StageRank[stage];
}

/**
 * Giai đoạn HIỆU LỰC lúc `now` — cột lưu cộng với những mốc thời gian đã qua.
 *
 * Job `charity:advance-stage` ghi kết quả này xuống, nhưng lượt đọc không chờ job: job trễ
 * một giờ thì app vẫn nhảy đúng tab (§3.2 — "mobile không tự suy giai đoạn từ ngày").
 *
 * - Chỉ tiến từ EXECUTION/EVENT. PLAN chỉ rời đi khi được duyệt; SUMMARY là cuối.
 * - EXECUTION → EVENT khi tới `DISTRIBUTION.startsAt`.
 * - → SUMMARY khi qua `DISTRIBUTION.endsAt`; chưa lập bước trao thì dùng `endTime` của dự án.
 */
export function effectiveOperationStage(input: {
  stored: CharityOperationStage;
  distribution: { startsAt: Date; endsAt: Date } | null;
  endTime: Date;
  now: Date;
}): CharityOperationStage {
  const { stored, distribution, endTime, now } = input;
  if (stored !== 'EXECUTION' && stored !== 'EVENT') return stored;
  const summaryAt = distribution?.endsAt ?? endTime;
  if (summaryAt.getTime() <= now.getTime()) return 'SUMMARY';
  if (
    stored === 'EXECUTION' &&
    distribution &&
    distribution.startsAt.getTime() <= now.getTime()
  )
    return 'EVENT';
  return stored;
}

/**
 * Bốn bước tiến độ phải theo đúng thứ tự và không chồng thời gian (§3.1). Trả danh sách lỗi,
 * rỗng là hợp lệ. Thiếu bước nào thì bỏ qua bước đó — lập dần từng bước là bình thường.
 */
export function phaseScheduleGaps(
  phases: readonly {
    phase: CharityPhaseKey;
    startsAt: Date;
    endsAt: Date;
  }[],
): string[] {
  const gaps: string[] = [];
  const seen = new Set<string>();
  for (const phase of phases) {
    if (seen.has(phase.phase))
      gaps.push(`phases: ${phase.phase} bị khai hai lần`);
    seen.add(phase.phase);
    if (phase.endsAt.getTime() <= phase.startsAt.getTime())
      gaps.push(`phases: ${phase.phase} kết thúc phải sau khi bắt đầu`);
  }
  const ordered = [...phases].sort(
    (a, b) =>
      CharityPhaseKeys.indexOf(a.phase) - CharityPhaseKeys.indexOf(b.phase),
  );
  for (let index = 1; index < ordered.length; index += 1)
    if (ordered[index].startsAt.getTime() < ordered[index - 1].endsAt.getTime())
      gaps.push(
        `phases: ${ordered[index].phase} bắt đầu trước khi ${ordered[index - 1].phase} kết thúc`,
      );
  return gaps;
}
