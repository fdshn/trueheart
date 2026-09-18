import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';

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

export interface IGetOwnRankSummaryResponseDto {
  rank: IRankSummaryDto;
}
