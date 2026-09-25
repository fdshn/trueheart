import { IUseCase } from '@chantam/service.common-lib/use-case';

export interface IRedeemPostWithPointsCommand {
  readonly postId: string;
  readonly requesterId: string;
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
