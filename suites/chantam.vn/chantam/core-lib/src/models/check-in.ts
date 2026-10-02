/**
 * Điểm danh, chuỗi ngày liên tiếp và lượt bù (F83).
 *
 * Mọi phép tính ngày và chuỗi nằm ở đây dưới dạng hàm THUẦN, vì đây là loại
 * nghiệp vụ mà lỗi chỉ hiện ra ở biên: nửa đêm giờ Việt Nam, ngày thiếu giữa
 * chuỗi, mốc thưởng đúng ngay sau một lần bù. Dựng database để kiểm những ca đó
 * là chậm và khó bày đủ; dựng chúng bằng bảng đầu vào/đầu ra thì vừa nhanh vừa
 * bày được ca không ai nghĩ tới.
 */

/**
 * Múi giờ nghiệp vụ. Việt Nam **không có giờ mùa hè** (bỏ từ 1975), nên lệch
 * luôn đúng +07:00 và không cần tra bảng múi giờ.
 *
 * Đây là lý do `businessDateOf` dịch thẳng 7 giờ rồi lấy ngày UTC: với một múi
 * giờ có DST thì cách đó sai hai lần mỗi năm, còn ở đây thì không bao giờ.
 */
export const CheckInTimeZone = 'Asia/Ho_Chi_Minh';

const VietnamOffsetMinutes = 7 * 60;
const MillisecondsPerDay = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD`. Dùng chuỗi chứ không `Date` để không ai vô tình mang giờ vào. */
export type BusinessDate = string;

const BusinessDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Đúng dạng `YYYY-MM-DD` **và** là một ngày có thật.
 *
 * Kiểm cả tính hợp lệ chứ không chỉ hình dạng: `2026-13-45` khớp biểu thức nhưng
 * không tồn tại, và nếu nó lọt xuống `$1::date` thì Postgres ném lỗi cú pháp —
 * tức 500 cho một lỗi của client. Phép kiểm vòng lại (`toISOString` của ngày đã
 * dựng phải khớp chuỗi vào) bắt cả tháng 13, ngày 32, và 29/02 của năm không nhuận.
 */
export function isBusinessDate(value: unknown): value is BusinessDate {
  if (typeof value !== 'string' || !BusinessDatePattern.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * Ngày nghiệp vụ của một mốc thời gian, theo giờ Việt Nam.
 *
 * KHÔNG dùng múi giờ của thiết bị hay của server: một người điểm danh lúc 00:30
 * giờ Việt Nam phải được tính vào ngày mới, kể cả khi server chạy ở UTC và ở đó
 * vẫn là ngày hôm trước.
 */
export function businessDateOf(at: Date): BusinessDate {
  const shifted = new Date(at.getTime() + VietnamOffsetMinutes * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function addBusinessDays(
  date: BusinessDate,
  days: number,
): BusinessDate {
  const base = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(base + days * MillisecondsPerDay).toISOString().slice(0, 10);
}

/** Số ngày từ `from` tới `to`. Âm nghĩa là `to` nằm trước `from`. */
export function businessDaysBetween(
  from: BusinessDate,
  to: BusinessDate,
): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      MillisecondsPerDay,
  );
}

export interface ICheckInMilestone {
  /** Số ngày liên tiếp cần đạt. Duy nhất và tăng dần trong một policy. */
  readonly streakDays: number;
  /** Điểm thưởng THÊM, ngoài điểm của ngày đó. */
  readonly bonusPoints: number;
}

export interface ICheckInPolicy {
  readonly enabled: boolean;
  /** Điểm cho một lần điểm danh thường. Ngày bù KHÔNG nhận số này. */
  readonly dailyPoints: number;
  readonly milestones: readonly ICheckInMilestone[];
  /** Số giao dịch tặng/nhận quà hoàn tất đổi một lượt bù. */
  readonly transactionsPerRepair: number;
  /** Số ngày được quay lại bù, tính từ ngày hiện tại. */
  readonly repairWindowDays: number;
}

/**
 * Mặc định **không phát điểm và không bật**.
 *
 * Đặc tả nói thẳng: *"không hard-code một giá trị mặc định có tác dụng phát
 * điểm"*. Nên mọi con số ở đây là 0/tắt, và `assertCheckInPolicyUsable` chặn
 * đường ghi cho tới khi Admin publish một bản thật. Một mặc định "tạm" 1 điểm/ngày
 * sẽ chạy im lặng ở production rồi thành con số không ai duyệt.
 */
export const DefaultCheckInPolicy: ICheckInPolicy = {
  enabled: false,
  dailyPoints: 0,
  milestones: [],
  transactionsPerRepair: 0,
  repairWindowDays: 0,
};

/** Mốc khởi đầu SRS nêu. Chỉ là gợi ý cho Admin, không phải giá trị chạy. */
export const SuggestedCheckInMilestoneDays: readonly number[] = [7, 14, 30, 50];

export const MaxCheckInDailyPoints = 1_000;
export const MaxCheckInMilestoneBonusPoints = 100_000;
export const MaxCheckInMilestoneCount = 50;
export const MaxTransactionsPerRepair = 1_000;
export const MaxRepairWindowDays = 365;

/** Mã rule ghi vào `point_ledger` cho điểm của một ngày điểm danh thường. */
export const CheckInDailyRuleCode = 'CHECK_IN_DAILY';
/** Mã rule cho thưởng mốc. Cộng THÊM, không thay điểm ngày. */
export const CheckInStreakMilestoneRuleCode = 'CHECK_IN_STREAK_MILESTONE';

/**
 * Chuẩn hoá policy do Admin nhập.
 *
 * Trả về `DefaultCheckInPolicy` khi dữ liệu không đọc được — **fail-closed**:
 * một bản policy rác không được biến thành một bản phát điểm bừa.
 */
export function normalizeCheckInPolicy(raw: unknown): ICheckInPolicy {
  if (typeof raw !== 'object' || raw === null) return DefaultCheckInPolicy;
  const source = raw as Record<string, unknown>;

  const clampInt = (value: unknown, min: number, max: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return min;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  };

  const rawMilestones = Array.isArray(source.milestones)
    ? source.milestones
    : [];
  const milestones: ICheckInMilestone[] = [];
  for (const entry of rawMilestones.slice(0, MaxCheckInMilestoneCount)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const streakDays = clampInt(item.streakDays, 0, 100_000);
    if (streakDays < 1) continue;
    milestones.push({
      streakDays,
      bonusPoints: clampInt(
        item.bonusPoints,
        0,
        MaxCheckInMilestoneBonusPoints,
      ),
    });
  }

  // Khử trùng theo `streakDays` rồi xếp tăng dần. Hai mốc cùng số ngày là một
  // câu hỏi không có câu trả lời — thưởng mức nào — nên giữ mốc KHAI SAU, đúng
  // lối "ô gửi lên thắng" của các đường publish khác.
  const byDays = new Map<number, ICheckInMilestone>();
  for (const milestone of milestones)
    byDays.set(milestone.streakDays, milestone);

  return {
    enabled: source.enabled === true,
    dailyPoints: clampInt(source.dailyPoints, 0, MaxCheckInDailyPoints),
    milestones: [...byDays.values()].sort(
      (left, right) => left.streakDays - right.streakDays,
    ),
    transactionsPerRepair: clampInt(
      source.transactionsPerRepair,
      0,
      MaxTransactionsPerRepair,
    ),
    repairWindowDays: clampInt(source.repairWindowDays, 0, MaxRepairWindowDays),
  };
}

/**
 * Những chỗ còn thiếu khiến policy KHÔNG dùng được để phát điểm.
 *
 * Trả danh sách chứ không boolean: Admin bật một policy thiếu số sẽ phải biết
 * thiếu cái nào, và "policy không hợp lệ" bắt họ đoán.
 *
 * Chỉ xét khi `enabled`. Một bản nháp đang tắt thì để trống là bình thường.
 */
export function checkInPolicyGaps(policy: ICheckInPolicy): string[] {
  if (!policy.enabled) return [];

  const gaps: string[] = [];
  if (policy.dailyPoints < 1) gaps.push('dailyPoints phải lớn hơn 0');
  if (policy.transactionsPerRepair < 1)
    gaps.push('transactionsPerRepair phải lớn hơn 0');
  if (policy.repairWindowDays < 1) gaps.push('repairWindowDays phải lớn hơn 0');
  // Mốc rỗng thì tính năng vẫn chạy được (chỉ có điểm ngày), nên KHÔNG chặn.
  // Nhưng một mốc thưởng 0 điểm thì là một mốc không làm gì — gần như chắc chắn
  // là ô bị bỏ trống, và nó sẽ hiện ra trên UI như một phần thưởng.
  for (const milestone of policy.milestones)
    if (milestone.bonusPoints < 1)
      gaps.push(`mốc ${milestone.streakDays} ngày có bonusPoints bằng 0`);

  return gaps;
}

export type CheckInKind = 'NORMAL' | 'REPAIR';
export type CheckInRunStatus = 'ACTIVE' | 'AT_RISK' | 'ENDED';

export interface ICheckInRunSummary {
  /**
   * Số ngày liên tiếp tính tới `latestCoveredDate`.
   *
   * Lỗ hổng cắt con số này: sau một ngày thiếu thì đếm lại từ đoạn mới. Đây là
   * con số dùng để xét mốc, nên **không phát mốc qua lỗ hổng** là hệ quả tự
   * nhiên chứ không phải một nhánh riêng phải nhớ.
   */
  readonly currentStreak: number;
  /** Chiều dài sẽ có nếu bù hết `pendingGapDates`. */
  readonly recoverableStreak: number;
  /** Những ngày còn thiếu trong khoảng của run, xếp CŨ TRƯỚC. */
  readonly pendingGapDates: readonly BusinessDate[];
}

/**
 * Tóm tắt một chuỗi từ danh sách ngày ĐÃ có dấu điểm danh.
 *
 * Nhận ngày thay vì đọc database để kiểm được bằng bảng, và để đường đối soát
 * dựng lại được chuỗi từ `check_in_entries` khi cần — đúng yêu cầu "tính lại
 * được từ entries".
 */
export function summarizeCheckInRun(params: {
  readonly startDate: BusinessDate;
  readonly latestCoveredDate: BusinessDate;
  readonly coveredDates: readonly BusinessDate[];
}): ICheckInRunSummary {
  const covered = new Set(params.coveredDates);
  const span =
    businessDaysBetween(params.startDate, params.latestCoveredDate) + 1;

  if (span <= 0)
    return { currentStreak: 0, recoverableStreak: 0, pendingGapDates: [] };

  const pendingGapDates: BusinessDate[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const date = addBusinessDays(params.startDate, offset);
    if (!covered.has(date)) pendingGapDates.push(date);
  }

  // Đếm ngược từ ngày cuối: đoạn liên tiếp HIỆN TẠI là thứ người dùng đang giữ,
  // và là thứ mốc thưởng xét.
  let currentStreak = 0;
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    if (!covered.has(addBusinessDays(params.startDate, offset))) break;
    currentStreak += 1;
  }

  return { currentStreak, recoverableStreak: span, pendingGapDates };
}

/**
 * Các mốc vừa đạt tới mà CHƯA từng được thưởng trong chuỗi này.
 *
 * Nhận `alreadyAwarded` thay vì tự suy từ chiều dài: sau một lần bù, chiều dài
 * nhảy vài ngày một lúc và có thể vượt qua nhiều mốc cùng lúc — nhưng mốc nào
 * đã trả rồi thì ở `check_in_milestone_awards`, không ở phép tính.
 */
export function milestonesNewlyReached(params: {
  readonly streakLength: number;
  readonly milestones: readonly ICheckInMilestone[];
  readonly alreadyAwarded: readonly number[];
}): ICheckInMilestone[] {
  const awarded = new Set(params.alreadyAwarded);
  return params.milestones
    .filter(
      (milestone) =>
        milestone.streakDays <= params.streakLength &&
        !awarded.has(milestone.streakDays),
    )
    .sort((left, right) => left.streakDays - right.streakDays);
}

/** Mốc kế tiếp chưa đạt, để app hiển thị "còn N ngày nữa". */
export function nextCheckInMilestone(params: {
  readonly streakLength: number;
  readonly milestones: readonly ICheckInMilestone[];
}): ICheckInMilestone | null {
  return (
    params.milestones.find(
      (milestone) => milestone.streakDays > params.streakLength,
    ) ?? null
  );
}

/**
 * Ngày bù có nằm trong cửa sổ cho phép hay không.
 *
 * Cửa sổ đếm từ ngày hiện tại lùi lại `repairWindowDays` ngày, và **không bao
 * gồm hôm nay**: hôm nay thì điểm danh thường, không phải bù.
 */
export function isRepairableDate(params: {
  readonly date: BusinessDate;
  readonly today: BusinessDate;
  readonly repairWindowDays: number;
}): boolean {
  const age = businessDaysBetween(params.date, params.today);
  return age >= 1 && age <= params.repairWindowDays;
}
