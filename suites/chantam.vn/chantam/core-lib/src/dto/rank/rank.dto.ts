import { UserRanks } from '../../consts';

export type RankMaintenanceCycleStatuses =
  'OPEN' | 'UNEVALUATED' | 'SATISFIED' | 'FAILED';

export interface IRankNextProgressDto {
  rank: UserRanks;
  requiredPoints: number;
  remainingPoints: number;
  requiredGifts: number;
  requiredReferrals: number;
  qualifiedReferrals: number;
}

export interface IRankMaintenanceCycleDto {
  rank: UserRanks;
  cycleStart: Date;
  cycleEnd: Date;
  giftsDone: number;
  referralsDone: number;
  status: RankMaintenanceCycleStatuses;
}

export interface IRankSummaryDto {
  rank: UserRanks;
  lifetimePoints: number;
  postQuota: number;
  nextRank: IRankNextProgressDto | null;
  maintenanceCycle: IRankMaintenanceCycleDto | null;
}

export interface IAdminRankTierPolicyDto {
  rank: UserRanks;
  thresholdPoints: number;
  warningPoints: number;
  requiredGifts: number;
  requiredReferrals: number;
  maintenanceGifts: number;
  maintenanceReferrals: number;
  version: number;
}

export interface IAdminRankTierPolicyInputDto {
  rank: UserRanks;
  thresholdPoints: number;
  warningPoints: number;
  requiredGifts: number;
  requiredReferrals: number;
}

export interface IPublishAdminRankPolicyDto {
  changeReason: string;
  tiers: IAdminRankTierPolicyInputDto[];
}

export interface IPublishAdminRankPolicyBodyDto {
  rankPolicy: IPublishAdminRankPolicyDto;
}

export interface IGetAdminRankPolicyResponseDto {
  rankPolicy: IAdminRankTierPolicyDto[];
}

export interface IPublishAdminRankPolicyResponseDto extends IGetAdminRankPolicyResponseDto {}

export interface IGetOwnRankSummaryResponseDto {
  rank: IRankSummaryDto;
}
