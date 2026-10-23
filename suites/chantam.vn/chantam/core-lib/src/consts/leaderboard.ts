import { BusinessTimeZone } from './time';

/**
 * Bảng thành tích tháng (thiết kế 24/10/2026).
 *
 * Ba bảng đếm SỐ LẦN, không đếm điểm: Người cho, Tấm lòng từ thiện, Chuyên cần.
 */
export enum LeaderboardBoards {
  /** Lượt trao `COMPLETED` mà user là người tặng. */
  GIVERS = 'GIVERS',
  /** Lượt giao nhận từ thiện `COMPLETED` có ít nhất một món thực nhận. */
  CHARITY = 'CHARITY',
  /** Ngày điểm danh thật (`NORMAL`) — ngày bù không tính. */
  CONSISTENCY = 'CONSISTENCY',
}

/** Khoá `system_configs`, đều INTEGER — endpoint cấu hình chung chỉ nhận INTEGER. */
export enum LeaderboardConfigKeys {
  ENABLED = 'leaderboard.enabled',
  MIN_GIVERS = 'leaderboard.min_givers',
  MIN_CHARITY = 'leaderboard.min_charity',
  MIN_CONSISTENCY_DAYS = 'leaderboard.min_consistency_days',
  BADGE_RANKS = 'leaderboard.badge_ranks',
  BADGE_MONTHS = 'leaderboard.badge_months',
}

/** Dùng khi khoá thiếu hoặc sai kiểu — đúng giá trị migration seed. */
export const LeaderboardConfigDefaults: Readonly<
  Record<LeaderboardConfigKeys, number>
> = {
  [LeaderboardConfigKeys.ENABLED]: 1,
  [LeaderboardConfigKeys.MIN_GIVERS]: 1,
  [LeaderboardConfigKeys.MIN_CHARITY]: 1,
  [LeaderboardConfigKeys.MIN_CONSISTENCY_DAYS]: 10,
  [LeaderboardConfigKeys.BADGE_RANKS]: 3,
  [LeaderboardConfigKeys.BADGE_MONTHS]: 3,
};

/**
 * Giờ Việt Nam lệch UTC cố định +7, không có giờ mùa hè — nên ranh giới tháng tính
 * thẳng bằng số học thay vì hỏi thư viện múi giờ.
 */
const VietnamOffsetMs = 7 * 60 * 60 * 1000;

const MonthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Tháng trong DB là `date` ngày 1 (`'YYYY-MM-01'`); trong API là `'YYYY-MM'`.
 * Sai dạng thì `null` — bên gọi trả 400, không đoán.
 */
export function parseLeaderboardMonth(value: string): string | null {
  return MonthPattern.test(value) ? `${value}-01` : null;
}

export function toLeaderboardMonthLabel(month: string): string {
  return month.slice(0, 7);
}

/** Tháng (ngày 1) chứa thời điểm `now`, theo giờ Việt Nam. */
export function vietnamMonthOf(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BusinessTimeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}-01`;
}

export function addMonths(month: string, count: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + count;
  const shifted = new Date(Date.UTC(year, index, 1));
  return shifted.toISOString().slice(0, 10);
}

export function previousMonth(month: string): string {
  return addMonths(month, -1);
}

/** `[start, end)` theo UTC của một tháng giờ Việt Nam. */
export function monthBoundsUtc(month: string): { start: Date; end: Date } {
  const startOf = (value: string) =>
    new Date(
      Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1) -
        VietnamOffsetMs,
    );
  return { start: startOf(month), end: startOf(addMonths(month, 1)) };
}
