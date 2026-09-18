import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';

export type RankMaintenanceCycleStatuses =
  'OPEN' | 'UNEVALUATED' | 'SATISFIED' | 'FAILED';

export interface IRankTierSummary {
  readonly rank: UserRanks;
  readonly thresholdPoints: number;
  readonly requiredGifts: number;
  readonly requiredReferrals: number;
  readonly postQuota: number;
}

export interface IRankMaintenanceCycleSummary {
  readonly rank: UserRanks;
  readonly cycleStart: Date;
  readonly cycleEnd: Date;
  readonly giftsDone: number;
  readonly referralsDone: number;
  readonly status: RankMaintenanceCycleStatuses;
}

export interface IRankSummary {
  readonly rank: UserRanks;
  readonly lifetimePoints: number;
  readonly currentTier: IRankTierSummary;
  readonly nextTier: IRankTierSummary | null;
  readonly qualifiedReferrals: number;
  readonly maintenanceCycle: IRankMaintenanceCycleSummary | null;
}

export interface IRankRepository {
  getOwnSummary(userId: string): Promise<IRankSummary>;
  promoteMemberOnboarding(userId: string): Promise<boolean>;
}

export const IRankRepository = Symbol('IRankRepository');
