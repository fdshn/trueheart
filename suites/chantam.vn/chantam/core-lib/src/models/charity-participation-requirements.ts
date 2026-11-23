import { RankOrder, UserRanks } from '../consts';

/**
 * Điều kiện tham gia chiến dịch từ thiện (PR #54, chốt 18/11).
 *
 * - `minimumSupervisors`: số GIÁM SÁT VIÊN tối thiểu chủ chiến dịch mong muốn (CR 22/11/2026). `0` = không
 *   đặt. Chỉ là CẢNH BÁO ở tổng kết — chưa đạt thì không tự huỷ chiến dịch.
 * - `minimumSupervisorRank`: hạng tối thiểu để ĐĂNG KÝ vai giám sát viên. `null` = không giới hạn. Chỉ
 *   chặn lượt đăng ký MỚI; người đã đăng ký giữ nguyên khi Admin nâng hạng sau đó.
 *
 * Hạng so theo `RankOrder` (enum backend), không so chuỗi tên hạng.
 */
export const MaxCharityMinimumSupervisors = 100_000;

export function charitySupervisorRequirementGaps(input: {
  readonly minimumSupervisors?: unknown;
  readonly minimumSupervisorRank?: unknown;
}): string[] {
  const gaps: string[] = [];
  const minimum = input.minimumSupervisors;
  if (
    minimum !== undefined &&
    !(
      typeof minimum === 'number' &&
      Number.isInteger(minimum) &&
      minimum >= 0 &&
      minimum <= MaxCharityMinimumSupervisors
    )
  )
    gaps.push(
      `minimumSupervisors phải là số nguyên từ 0 tới ${MaxCharityMinimumSupervisors}`,
    );

  const rank = input.minimumSupervisorRank;
  if (
    rank !== undefined &&
    rank !== null &&
    !RankOrder.includes(rank as UserRanks)
  )
    gaps.push(
      `minimumSupervisorRank phải là null hoặc một trong: ${RankOrder.join(', ')}`,
    );

  return gaps;
}

/**
 * Đạt số giám sát viên tối thiểu chưa — tính theo người ĐÃ CHECK-IN (thật sự có mặt), chốt 18/11.
 * `minimum = 0` nghĩa là không đặt, nên luôn đạt.
 */
export function charityMinimumSupervisorsMet(
  minimum: number,
  checkedInCount: number,
): boolean {
  return checkedInCount >= minimum;
}
