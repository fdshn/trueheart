import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { evaluateRank, type IRankTier } from './rank-policy';

const RankTiers: readonly IRankTier[] = [
  {
    rank: UserRanks.VIEWER,
    thresholdPoints: 0,
    requiredGifts: 0,
    requiredReferrals: 0,
  },
  {
    rank: UserRanks.MEMBER,
    thresholdPoints: 224,
    requiredGifts: 0,
    requiredReferrals: 0,
  },
  {
    rank: UserRanks.SILVER,
    thresholdPoints: 672,
    requiredGifts: 1,
    requiredReferrals: 1,
  },
  {
    rank: UserRanks.GOLD,
    thresholdPoints: 896,
    requiredGifts: 0,
    requiredReferrals: 0,
  },
  {
    rank: UserRanks.DIAMOND,
    thresholdPoints: 1792,
    requiredGifts: 0,
    requiredReferrals: 0,
  },
];

const Now = new Date('2026-09-18T00:00:00.000Z');

function evaluateNormalRank(overrides = {}) {
  return evaluateRank({
    mode: 'NORMAL',
    currentRank: UserRanks.MEMBER,
    isMember: true,
    lifetimePoints: 0,
    completedGifts: 0,
    qualifiedReferrals: 0,
    promotionLockedUntil: null,
    now: Now,
    tiers: RankTiers,
    ...overrides,
  });
}

describe('evaluateRank', () => {
  it('keeps a non-member at Viewer despite high lifetime points', () => {
    expect(
      evaluateNormalRank({
        currentRank: UserRanks.VIEWER,
        isMember: false,
        lifetimePoints: 10_000,
        completedGifts: 10,
        qualifiedReferrals: 10,
      }),
    ).toEqual({ rank: UserRanks.VIEWER });
  });

  it('keeps a Member at Member with zero points', () => {
    expect(evaluateNormalRank()).toEqual({ rank: UserRanks.MEMBER });
  });

  it('keeps a Member below Silver without its gift and referral qualifications', () => {
    expect(
      evaluateNormalRank({
        lifetimePoints: 800,
        completedGifts: 0,
        qualifiedReferrals: 0,
      }),
    ).toEqual({ rank: UserRanks.MEMBER });
  });

  it('promotes a qualified Member to Silver', () => {
    expect(
      evaluateNormalRank({
        lifetimePoints: 700,
        completedGifts: 1,
        qualifiedReferrals: 1,
      }),
    ).toEqual({ rank: UserRanks.SILVER });
  });

  it('selects the highest eligible tier', () => {
    expect(
      evaluateNormalRank({
        lifetimePoints: 1_800,
        completedGifts: 1,
        qualifiedReferrals: 1,
      }),
    ).toEqual({ rank: UserRanks.DIAMOND });
  });

  it('holds the current rank when a promotion lock remains active', () => {
    expect(
      evaluateNormalRank({
        currentRank: UserRanks.SILVER,
        lifetimePoints: 1_800,
        completedGifts: 1,
        qualifiedReferrals: 1,
        promotionLockedUntil: new Date('2026-09-18T00:00:00.001Z'),
      }),
    ).toEqual({ rank: UserRanks.SILVER });
  });

  it('permits promotion after a lock has expired', () => {
    expect(
      evaluateNormalRank({
        lifetimePoints: 1_800,
        completedGifts: 1,
        qualifiedReferrals: 1,
        promotionLockedUntil: Now,
      }),
    ).toEqual({ rank: UserRanks.DIAMOND });
  });

  it('allows a downgrade while a promotion lock remains active', () => {
    expect(
      evaluateNormalRank({
        currentRank: UserRanks.GOLD,
        lifetimePoints: 224,
        promotionLockedUntil: new Date('2026-09-18T00:00:00.001Z'),
      }),
    ).toEqual({ rank: UserRanks.MEMBER });
  });

  it('preserves the current rank when maintenance activity is unavailable', () => {
    expect(
      evaluateRank({
        mode: 'MAINTENANCE',
        currentRank: UserRanks.DIAMOND,
        isMember: true,
        activityAvailable: false,
      }),
    ).toEqual({
      rank: UserRanks.DIAMOND,
      maintenanceStatus: 'UNEVALUATED',
    });
  });

  it('demotes Diamond to Gold exactly once after failed maintenance', () => {
    expect(
      evaluateRank({
        mode: 'MAINTENANCE',
        currentRank: UserRanks.DIAMOND,
        isMember: true,
        activityAvailable: true,
        maintenanceSatisfied: false,
      }),
    ).toEqual({ rank: UserRanks.GOLD, maintenanceStatus: 'FAILED' });
  });

  it('does not demote Member below Member after failed maintenance', () => {
    expect(
      evaluateRank({
        mode: 'MAINTENANCE',
        currentRank: UserRanks.MEMBER,
        isMember: true,
        activityAvailable: true,
        maintenanceSatisfied: false,
      }),
    ).toEqual({ rank: UserRanks.MEMBER, maintenanceStatus: 'FAILED' });
  });

  it('preserves the current rank after satisfied maintenance', () => {
    expect(
      evaluateRank({
        mode: 'MAINTENANCE',
        currentRank: UserRanks.SILVER,
        isMember: true,
        activityAvailable: true,
        maintenanceSatisfied: true,
      }),
    ).toEqual({ rank: UserRanks.SILVER, maintenanceStatus: 'SATISFIED' });
  });
});
