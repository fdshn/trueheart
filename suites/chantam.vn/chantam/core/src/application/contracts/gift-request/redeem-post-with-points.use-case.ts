import { IUseCase } from '@chantam/service.common-lib/use-case';

export interface IRedeemPostWithPointsCommand {
  readonly postId: string;
  readonly requesterId: string;
  /**
   * Số điểm người dùng ĐÃ THẤY ở báo giá và đồng ý trả.
   *
   * Bắt buộc, không phải tuỳ chọn: một phép xác nhận bỏ qua được bằng cách không
   * gửi trường nào thì không phải phép xác nhận. Lệch với giá tính lại ở máy chủ
   * thì ném `RedemptionQuoteStaleException` và KHÔNG trừ gì.
   */
  readonly confirmedPoints: number;
}

export interface IRedeemPostWithPointsResult {
  readonly postId: string;
  readonly transactionId: string;
  /** Số điểm đã trừ. */
  readonly pointsSpent: number;
  /** Điểm còn lại sau khi trừ. */
  readonly balanceAfter: number;
}

export interface IRedeemPostWithPointsUseCase extends IUseCase<
  IRedeemPostWithPointsCommand,
  IRedeemPostWithPointsResult
> {}

export const IRedeemPostWithPointsUseCase = Symbol(
  'IRedeemPostWithPointsUseCase',
);
