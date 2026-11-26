/**
 * Đăng ký ủng hộ tiền cho chiến dịch từ thiện (CR 25/11/2026,
 * docs/plans/2026-11-25-charity-money-pledges.md).
 *
 * Cơ chế LỜI KHAI giống Công đức: `INTENDED` = dự định chuyển, `COMPLETED` = người ủng hộ tự báo
 * đã chuyển. Cả hai đều KHÔNG được hệ thống xác minh. Tổng lời khai là một dòng số liệu riêng,
 * không bao giờ cộng vào số thực nhận (`confirmedAmount` + `externalAmount` do chủ dự án nhập).
 */
import { CharityItemValueUnitVnd } from './charity-points';

export const CharityMoneyPledgeStatuses = ['INTENDED', 'COMPLETED'] as const;
export type CharityMoneyPledgeStatus =
  (typeof CharityMoneyPledgeStatuses)[number];

/** Cùng thang với Công đức (`Min/MaxMeritDeclaredAmount`): 1.000đ → 10 tỷ. */
export const MinCharityMoneyPledgeAmount = 1_000;
export const MaxCharityMoneyPledgeAmount = 10_000_000_000;
export const MaxCharityMoneyPledgeNoteLength = 500;
export const MaxCharityMoneyPledgeHiddenReasonLength = 500;

/**
 * Nội dung chuyển khoản `CT <mã>`: mã 6 ký tự bỏ các ký tự dễ đọc nhầm (0/O, 1/I/L) để người
 * ủng hộ gõ tay vẫn đúng, và chủ dự án dò sao kê tìm được.
 */
export const CharityMoneyPledgeTransferPrefix = 'CT';
export const CharityMoneyPledgeCodeAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CharityMoneyPledgeCodeLength = 6;

export function charityMoneyPledgeTransferContent(code: string): string {
  return `${CharityMoneyPledgeTransferPrefix} ${code}`;
}

/** Tỷ lệ điểm ủng hộ tiền so với điểm vật phẩm (%), Admin đổi được. Mặc định 50. */
export const CharityMoneyPledgePointsPercentConfigKey =
  'charity.money_pledge.points_percent';
export const DefaultCharityMoneyPledgePointsPercent = 50;
export const MaxCharityMoneyPledgePointsPercent = 100;

export function isCharityMoneyPledgeAmount(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= MinCharityMoneyPledgeAmount &&
    (value as number) <= MaxCharityMoneyPledgeAmount
  );
}

/**
 * Điểm gốc của một lời khai khi dự án kết thúc:
 * `floor(số tiền / 10.000 × điểm rule CHARITY_ITEM_VALUE × % / 100)`.
 *
 * Nhân trước rồi chia một lần để không mất phần lẻ giữa chừng (500.000đ, 1 điểm, 50% → 25).
 * Số lớn nhất: 10^10 × điểm rule × 100 — vẫn nằm trong số nguyên an toàn với mọi mức điểm
 * hợp lý (< 9.007 điểm / 10.000đ).
 */
export function moneyPledgePoints(input: {
  readonly pledgedAmount: number;
  readonly itemValueRulePoints: number;
  readonly percent: number;
}): number {
  const { pledgedAmount, itemValueRulePoints, percent } = input;
  if (pledgedAmount <= 0 || itemValueRulePoints <= 0 || percent <= 0) return 0;
  return Math.floor(
    (pledgedAmount * itemValueRulePoints * percent) /
      (CharityItemValueUnitVnd * 100),
  );
}
