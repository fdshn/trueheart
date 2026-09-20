import { IUseCase } from '@chantam/service.common-lib';

/** Số người xử lý mỗi lượt chạy đối soát. */
export const PhoneRewardReconcileBatchSize = 200;

export interface IReconcilePhoneRewardsCommand {
  limit?: number;
}

export interface IReconcilePhoneRewardsResult {
  repairedRewards: number;
}

export interface IReconcilePhoneRewardsUseCase extends IUseCase<
  IReconcilePhoneRewardsCommand,
  IReconcilePhoneRewardsResult
> {}

export const IReconcilePhoneRewardsUseCase = Symbol(
  'IReconcilePhoneRewardsUseCase',
);
