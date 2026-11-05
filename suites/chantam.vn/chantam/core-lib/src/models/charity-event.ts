/**
 * Dự án từ thiện 4 giai đoạn — đợt 3 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.5, §3.15):
 * timeline sự kiện trao, bài ảnh/clip có quota, tín hiệu realtime. Quyền đăng của participant theo
 * check-in (chốt 05/11) — thay cho vai "cộng tác viên sự kiện" cũ.
 */
import { CharityOperationStage } from './charity-project';

// ── Timeline tab C ──────────────────────────────────────────────────────────

export const CharityEventStepKeys = [
  'GATHER',
  'BRIEFING',
  'TRAVEL',
  'REST_STOP',
  'ARRIVE',
  'MEET_LOCAL_AUTHORITY',
  'MEET_RECIPIENTS',
  'DISTRIBUTE',
  'WRAP_UP',
  'RETURN',
] as const;
export type CharityEventStepKey = (typeof CharityEventStepKeys)[number];

export const CharityEventStepLabels: Readonly<
  Record<CharityEventStepKey, string>
> = {
  GATHER: 'Tập hợp',
  BRIEFING: 'Họp ngắn',
  TRAVEL: 'Di chuyển',
  REST_STOP: 'Nghỉ chân',
  ARRIVE: 'Đến nơi',
  MEET_LOCAL_AUTHORITY: 'Làm việc với địa phương',
  MEET_RECIPIENTS: 'Gặp bên nhận',
  DISTRIBUTE: 'Trao quà',
  WRAP_UP: 'Tổng kết, cảm ơn',
  RETURN: 'Trở về',
};

export const CharityEventStepStatuses = [
  'PENDING',
  'IN_PROGRESS',
  'DONE',
] as const;
export type CharityEventStepStatus = (typeof CharityEventStepStatuses)[number];

// ── Bài ảnh/clip ────────────────────────────────────────────────────────────

export const CharityPostAuthorRoles = [
  'ORGANIZER',
  'COORDINATOR',
  'PARTICIPANT',
] as const;
export type CharityPostAuthorRole = (typeof CharityPostAuthorRoles)[number];

export const CharityPostMediaTypes = ['IMAGE', 'VIDEO'] as const;
export type CharityPostMediaType = (typeof CharityPostMediaTypes)[number];

/** Tối đa media trong một bài: đủ dùng trọn quota một ngày (5 clip + 5 ảnh). */
export const MaxCharityPostMedia = 10;
export const MaxCharityPostBodyLength = 2000;

export const CharityPostDailyVideoQuotaConfigKey =
  'charity.post_daily_video_quota';
export const CharityPostDailyImageQuotaConfigKey =
  'charity.post_daily_image_quota';
/** Chốt §7.6: 5 clip + 5 ảnh / người / ngày / dự án; Admin chỉnh. */
export const DefaultCharityPostDailyQuota = 5;

/** Kẹp giá trị cấu hình quota về 0–100; hỏng thì về mặc định. `0` = tắt loại media đó. */
export function normalizeCharityPostQuota(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed)) return DefaultCharityPostDailyQuota;
  return Math.min(Math.max(parsed, 0), 100);
}

/** Loại media theo content type của đường tải. */
export function charityPostMediaTypeOf(
  contentType: string,
): CharityPostMediaType | null {
  if (contentType.startsWith('image/')) return 'IMAGE';
  if (contentType.startsWith('video/')) return 'VIDEO';
  return null;
}

const VietnamOffsetMs = 7 * 60 * 60 * 1000;

/**
 * 0 giờ hôm nay theo giờ Việt Nam (UTC+7, không giờ mùa hè), dưới dạng thời điểm UTC — mốc
 * đếm quota ngày.
 */
export function vietnamDayStart(now: Date): Date {
  const shifted = now.getTime() + VietnamOffsetMs;
  const dayStart =
    shifted - (((shifted % 86_400_000) + 86_400_000) % 86_400_000);
  return new Date(dayStart - VietnamOffsetMs);
}

/**
 * Ai đăng bài được, với vai gì (§3.5):
 * - Người tổ chức, coordinator, Admin ghi: mọi giai đoạn SAU khi duyệt.
 * - Participant: chỉ khi ban tổ chức đã xác nhận VÀ đã check-in (hoặc đã hoàn thành), và dự án
 *   đang ở Sự kiện trao. Không cần có đóng góp.
 * `null` = không được đăng.
 */
export function charityPostRole(input: {
  readonly approved: boolean;
  readonly suspended: boolean;
  readonly isOrganizer: boolean;
  readonly isCoordinator: boolean;
  readonly isAttendedParticipant: boolean;
  readonly stage: CharityOperationStage;
}): CharityPostAuthorRole | null {
  if (!input.approved || input.suspended) return null;
  if (input.isOrganizer) return 'ORGANIZER';
  if (input.isCoordinator) return 'COORDINATOR';
  if (input.isAttendedParticipant && input.stage === 'EVENT')
    return 'PARTICIPANT';
  return null;
}

// ── Realtime (§3.15) ────────────────────────────────────────────────────────

/** Phần nào của dự án vừa đổi — client gọi lại đúng API của phần đó. */
export const CharityRealtimeSections = [
  'STAGE',
  'TIMELINE',
  'POSTS',
  'CHECKLIST',
  /** Đợt 5: danh sách / trạng thái participant (duyệt, check-in) vừa đổi. */
  'PARTICIPANTS',
  /** Đợt 4: tổng kết / báo cáo tài chính vừa công khai hoặc sửa. */
  'SUMMARY',
] as const;
export type CharityRealtimeSection = (typeof CharityRealtimeSections)[number];

/** Gộp tín hiệu theo dự án: tối đa 1 lần / khoảng này. */
export const CharityRealtimeCoalesceMs = 1000;
/** Số kết nối socket `charity` tối đa của một người trên một instance. */
export const MaxCharitySocketsPerUser = 5;

export function charityRealtimeRoom(
  campaignId: string,
  scope: 'public' | 'workspace',
): string {
  return `charity:${campaignId}:${scope}`;
}
