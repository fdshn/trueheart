import { IUseCase } from '@chantam/service.common-lib';

/** Số bản ghi xử lý mỗi lượt quét, cho từng loại mốc. */
export const MilestoneRewardReconcileBatchSize = 200;

export interface IReconcileMilestoneRewardsCommand {
  limit?: number;
}

export interface IReconcileMilestoneRewardsResult {
  /** Thưởng xác minh SĐT đã vá. */
  repairedRewards: number;
  /** Thưởng hoàn tất onboarding đã vá. */
  repairedOnboarding: number;
  /** Lượt giới thiệu đang treo đã đánh dấu hợp lệ được. */
  repairedReferrals: number;
}

export interface IReconcileMilestoneRewardsUseCase extends IUseCase<
  IReconcileMilestoneRewardsCommand,
  IReconcileMilestoneRewardsResult
> {}

export const IReconcileMilestoneRewardsUseCase = Symbol(
  'IReconcileMilestoneRewardsUseCase',
);
