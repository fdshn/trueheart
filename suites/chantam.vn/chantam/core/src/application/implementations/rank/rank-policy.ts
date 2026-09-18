import { RankOrder, UserRanks } from '@chantam.vn/chantam.core-lib/consts';

export interface IRankTier {
  readonly rank: UserRanks;
  readonly thresholdPoints: number;
  readonly requiredGifts: number;
  readonly requiredReferrals: number;
}

export interface INormalRankEvaluationInput {
  readonly mode: 'NORMAL';
  readonly currentRank: UserRanks;
  readonly isMember: boolean;
  readonly lifetimePoints: number;
  readonly completedGifts: number;
  readonly qualifiedReferrals: number;
  readonly promotionLockedUntil: Date | null;
  readonly now: Date;
  readonly tiers: readonly IRankTier[];
}

interface IRankMaintenanceInput {
  readonly mode: 'MAINTENANCE';
  readonly currentRank: UserRanks;
  readonly isMember: boolean;
}

export interface IUnavailableRankMaintenanceInput extends IRankMaintenanceInput {
  readonly activityAvailable: false;
}

export interface IAvailableRankMaintenanceInput extends IRankMaintenanceInput {
  readonly activityAvailable: true;
  readonly maintenanceSatisfied: boolean;
}

export type IRankEvaluationInput =
  | INormalRankEvaluationInput
  | IUnavailableRankMaintenanceInput
  | IAvailableRankMaintenanceInput;

export type RankMaintenanceStatuses = 'UNEVALUATED' | 'SATISFIED' | 'FAILED';

export interface IRankEvaluationResult {
  readonly rank: UserRanks;
  readonly maintenanceStatus?: RankMaintenanceStatuses;
}

export function evaluateRank(
  input: IRankEvaluationInput,
): IRankEvaluationResult {
  if (input.mode === 'MAINTENANCE') return evaluateMaintenanceRank(input);

  if (!input.isMember) return { rank: UserRanks.VIEWER };

  const eligibleRank = getHighestEligibleRank(input);
  const promotionIsLocked =
    input.promotionLockedUntil !== null &&
    input.promotionLockedUntil > input.now;

  if (
    promotionIsLocked &&
    getRankPosition(eligibleRank) > getRankPosition(input.currentRank)
  ) {
    return { rank: input.currentRank };
  }

  return { rank: eligibleRank };
}

function evaluateMaintenanceRank(
  input: IUnavailableRankMaintenanceInput | IAvailableRankMaintenanceInput,
): IRankEvaluationResult {
  if (!input.activityAvailable) {
    return {
      rank: input.currentRank,
      maintenanceStatus: 'UNEVALUATED',
    };
  }

  if (input.maintenanceSatisfied) {
    return {
      rank: input.currentRank,
      maintenanceStatus: 'SATISFIED',
    };
  }

  return {
    rank: getRankBelow(input.currentRank, input.isMember),
    maintenanceStatus: 'FAILED',
  };
}

function getHighestEligibleRank(input: INormalRankEvaluationInput): UserRanks {
  let highestEligibleRank = UserRanks.MEMBER;

  for (const rank of RankOrder) {
    if (rank === UserRanks.VIEWER) continue;

    const tier = input.tiers.find((candidate) => candidate.rank === rank);
    if (
      tier &&
      input.lifetimePoints >= tier.thresholdPoints &&
      input.completedGifts >= tier.requiredGifts &&
      input.qualifiedReferrals >= tier.requiredReferrals
    ) {
      highestEligibleRank = rank;
    }
  }

  return highestEligibleRank;
}

function getRankBelow(currentRank: UserRanks, isMember: boolean): UserRanks {
  const floor = isMember ? UserRanks.MEMBER : UserRanks.VIEWER;
  const currentPosition = getRankPosition(currentRank);
  const floorPosition = getRankPosition(floor);

  return RankOrder[Math.max(currentPosition - 1, floorPosition)];
}

function getRankPosition(rank: UserRanks): number {
  return RankOrder.indexOf(rank);
}
