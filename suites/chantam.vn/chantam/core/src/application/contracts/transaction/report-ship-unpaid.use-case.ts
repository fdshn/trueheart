import { IUseCase } from '@chantam/service.common-lib';

export interface IReportShipUnpaidCommand {
  transactionId: string;
  /** Người gửi — chỉ họ mới báo được, vì chỉ họ thấy hàng bị hoàn. */
  userId: string;
  reason: string;
}

export interface IReportShipUnpaidResult {
  transactionId: string;
  /** Người bị trừ điểm. */
  penalizedUserId: string;
  /** Số điểm bị trừ, lấy từ point rule nên Admin chỉnh được. */
  penaltyPoints: number;
  /** Số điểm TIÊU ĐƯỢC sau khi trừ. Kẹp ở 0. */
  balanceAfter: number;
  /** Giá trị THẬT sau khi trừ, có thể âm. */
  rawBalanceAfter: number;
  /** `false` khi lượt trao này đã bị báo trước đó — không trừ điểm lần hai. */
  penaltyApplied: boolean;
}

/**
 * Người gửi báo: hàng bị hoàn và người nhận không thanh toán phí ship (CH-2).
 *
 * Chỉ áp dụng khi bài khai `shipPayer = RECEIVER`. Khoản trừ đi qua chính
 * `point_ledger` với khoá chống trùng theo lượt trao, nên báo hai lần chỉ trừ
 * một lần.
 */
export interface IReportShipUnpaidUseCase extends IUseCase<
  IReportShipUnpaidCommand,
  IReportShipUnpaidResult
> {}

export const IReportShipUnpaidUseCase = Symbol('IReportShipUnpaidUseCase');
