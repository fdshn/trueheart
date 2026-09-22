import { IUseCase } from '@chantam/service.common-lib';

export interface IReportShipUnpaidCommand {
  transactionId: string;
  /** Người gửi — chỉ họ mới báo được, vì chỉ họ thấy hàng bị hoàn. */
  userId: string;
  reason: string;
  /**
   * Ảnh gói hàng quay về, **bắt buộc**, tối đa 3 tấm.
   *
   * Ảnh lúc trao chỉ chứng minh người tặng có trao; ảnh hàng quay về mới chứng minh
   * nó không tới đích. Thiếu tấm này thì report không dựa trên gì cả.
   */
  evidenceKeys: string[];
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
  /** Trạng thái lượt trao sau khi báo. Luôn là `CANCELLED`. */
  transactionStatus: string;
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
