import { RankOrder, UserRanks } from '../consts';

/**
 * Điều kiện tham gia chiến dịch từ thiện (PR #54, chốt 18/11).
 *
 * - `minimumParticipants`: số người tham gia tối thiểu chủ chiến dịch mong muốn. `0` = không
 *   đặt. Chỉ là CẢNH BÁO ở tổng kết — chưa đạt thì không tự huỷ chiến dịch.
 * - `minimumParticipantRank`: hạng tối thiểu để ĐĂNG KÝ tham gia. `null` = không giới hạn. Chỉ
 *   chặn lượt đăng ký MỚI; người đã đăng ký giữ nguyên khi Admin nâng hạng sau đó.
 *
 * Hạng so theo `RankOrder` (enum backend), không so chuỗi tên hạng.
 */
export const MaxCharityMinimumParticipants = 100_000;

export function charityParticipationRequirementGaps(input: {
  readonly minimumParticipants?: unknown;
  readonly minimumParticipantRank?: unknown;
}): string[] {
  const gaps: string[] = [];
  const minimum = input.minimumParticipants;
  if (
    minimum !== undefined &&
    !(
      typeof minimum === 'number' &&
      Number.isInteger(minimum) &&
      minimum >= 0 &&
      minimum <= MaxCharityMinimumParticipants
    )
  )
    gaps.push(
      `minimumParticipants phải là số nguyên từ 0 tới ${MaxCharityMinimumParticipants}`,
    );

  const rank = input.minimumParticipantRank;
  if (
    rank !== undefined &&
    rank !== null &&
    !RankOrder.includes(rank as UserRanks)
  )
    gaps.push(
      `minimumParticipantRank phải là null hoặc một trong: ${RankOrder.join(', ')}`,
    );

  return gaps;
}

/**
 * Đạt số người tối thiểu chưa — tính theo người ĐÃ CHECK-IN (thật sự có mặt), chốt 18/11.
 * `minimum = 0` nghĩa là không đặt, nên luôn đạt.
 */
export function charityMinimumParticipantsMet(
  minimum: number,
  checkedInCount: number,
): boolean {
  return checkedInCount >= minimum;
}
