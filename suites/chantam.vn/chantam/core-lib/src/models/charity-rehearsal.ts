/**
 * Bước tổng duyệt trước sự kiện trao (CR 22/11/2026 §8): checklist chốt thông tin, kết quả
 * READY/NOT_READY. Chỉ sang Sự kiện trao khi READY.
 */

export const CharityRehearsalOutcomes = ['READY', 'NOT_READY'] as const;
export type CharityRehearsalOutcome = (typeof CharityRehearsalOutcomes)[number];

export const CharityRehearsalChecklistKeys = [
  'RECIPIENTS',
  'GOODS_AND_FUNDS',
  'TRANSPORT',
  'STAFF',
  'SUPERVISORS',
  'VENUE_AND_TIME',
  'LOCAL_CONTACT',
] as const;
export type CharityRehearsalChecklistKey =
  (typeof CharityRehearsalChecklistKeys)[number];

export const CharityRehearsalChecklistLabels: Readonly<
  Record<CharityRehearsalChecklistKey, string>
> = {
  RECIPIENTS: 'Người nhận đã chốt',
  GOODS_AND_FUNDS: 'Hiện vật, tiền đã đủ',
  TRANSPORT: 'Phương tiện đã chốt',
  STAFF: 'Nhân sự đã phân công',
  SUPERVISORS: 'Giám sát viên đã xác nhận',
  VENUE_AND_TIME: 'Địa điểm, thời gian trao đã chốt',
  LOCAL_CONTACT: 'Đã liên hệ địa phương',
};

export const CharityRehearsalItemStatuses = ['DONE', 'NOT_DONE'] as const;
export type CharityRehearsalItemStatus =
  (typeof CharityRehearsalItemStatuses)[number];

export interface ICharityRehearsalChecklistItem {
  readonly key: CharityRehearsalChecklistKey;
  readonly status: CharityRehearsalItemStatus;
  readonly note: string | null;
}

/** Luôn đủ 7 mục theo thứ tự khoá; mục lạ bị bỏ, mục thiếu là NOT_DONE. */
export function normalizeRehearsalChecklist(
  input: readonly Partial<ICharityRehearsalChecklistItem>[] | null | undefined,
): ICharityRehearsalChecklistItem[] {
  const byKey = new Map((input ?? []).map((item) => [item.key, item]));
  return CharityRehearsalChecklistKeys.map((key) => {
    const item = byKey.get(key);
    return {
      key,
      status: item?.status === 'DONE' ? 'DONE' : 'NOT_DONE',
      note:
        typeof item?.note === 'string' && item.note.trim() ? item.note : null,
    };
  });
}

/** Hai mốc nhắc trước 48 giờ của chiến dịch. */
export const CharityPreEventMilestones = ['REHEARSAL', 'DISTRIBUTION'] as const;
export type CharityPreEventMilestone =
  (typeof CharityPreEventMilestones)[number];

/** Lý do job nhắc ban tổ chức khi chiến dịch bị giữ lại ở một giai đoạn. */
export const CharityOrganizerReminderReasons = [
  'REHEARSAL_NOT_READY',
  'DISTRIBUTION_EVIDENCE_MISSING',
  'BENEFICIARY_ACCOUNT_NOT_VERIFIED',
  'SUMMARY_OVERDUE',
] as const;
export type CharityOrganizerReminderReason =
  (typeof CharityOrganizerReminderReasons)[number];
