/**
 * Ba khung thời gian của chiến dịch (CR 22/11/2026 §3.17b): tiếp nhận → trao → kết thúc.
 *
 * Thứ tự bắt buộc: `intakeStartsAt ≤ intakeEndsAt ≤ distributionStartsAt ≤ distributionEndsAt
 * ≤ endTime` (bằng nhau được phép). Giá trị chưa lập (`null`) bỏ qua các cặp dính tới nó — bản
 * nháp được lưu dở; đủ ba khung chỉ bắt buộc lúc gửi duyệt (`charityScheduleComplete`).
 */
export interface ICharitySchedule {
  intakeStartsAt: Date;
  intakeEndsAt: Date | null;
  distributionStartsAt: Date | null;
  distributionEndsAt: Date | null;
  endTime: Date;
}

const Order = [
  'intakeStartsAt',
  'intakeEndsAt',
  'distributionStartsAt',
  'distributionEndsAt',
  'endTime',
] as const;

/** Mỗi cặp liền kề bị ngược thứ tự → một lỗi `schedule.<trước>: phải ≤ <sau>`. */
export function charityScheduleGaps(schedule: ICharitySchedule): string[] {
  const gaps: string[] = [];
  for (let i = 0; i + 1 < Order.length; i += 1) {
    const before = schedule[Order[i]];
    const after = schedule[Order[i + 1]];
    if (!before || !after) continue;
    if (before.getTime() > after.getTime())
      gaps.push(`schedule.${Order[i]}: phải ≤ ${Order[i + 1]}`);
  }
  return gaps;
}

/** Trường lịch còn thiếu khi gửi duyệt. */
export function charityScheduleComplete(schedule: ICharitySchedule): string[] {
  return (
    ['intakeEndsAt', 'distributionStartsAt', 'distributionEndsAt'] as const
  )
    .filter((key) => schedule[key] === null)
    .map((key) => `schedule.${key}`);
}

/**
 * Đã hết tiếp nhận (CR 22/11/2026 §3.9): từ `intakeEndsAt` trở đi chặn đóng góp hiện vật, nhận
 * hỗ trợ và đăng ký tham gia MỚI. `null` (chưa lập) = chưa đóng.
 */
export function isIntakeClosed(
  campaign: { readonly intakeEndsAt: Date | null },
  now: Date,
): boolean {
  if (!campaign.intakeEndsAt) return false;
  return campaign.intakeEndsAt.getTime() <= now.getTime();
}
