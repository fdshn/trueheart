import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { RankRepository } from './rank.repository';

const UserId = '10000000-0000-4000-8000-000000000001';
const CycleStart = new Date('2026-09-01T00:00:00.000Z');
const CycleEnd = new Date('2026-10-01T00:00:00.000Z');

function populatedRow(overrides = {}) {
  return {
    rank: UserRanks.SILVER,
    lifetime_points: '700',
    threshold_points: '672',
    required_gifts: '1',
    required_referrals: '1',
    post_quota: '10',
    qualified_referrals: '2',
    maintenance_rank: UserRanks.SILVER,
    cycle_start: CycleStart,
    cycle_end: CycleEnd,
    gifts_done: '2',
    referrals_done: '1',
    maintenance_status: 'UNEVALUATED' as const,
    ...overrides,
  };
}

describe('RankRepository', () => {
  it('maps a persisted summary, numeric strings, and UNEVALUATED cycle faithfully', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([populatedRow()])
      .mockResolvedValueOnce([
        {
          rank: UserRanks.GOLD,
          threshold_points: '896',
          required_gifts: '0',
          required_referrals: '0',
          post_quota: '20',
        },
      ]);
    const repository = new RankRepository({ query } as never);

    await expect(repository.getOwnSummary(UserId)).resolves.toEqual({
      rank: UserRanks.SILVER,
      lifetimePoints: 700,
      currentTier: {
        rank: UserRanks.SILVER,
        thresholdPoints: 672,
        requiredGifts: 1,
        requiredReferrals: 1,
        postQuota: 10,
      },
      nextTier: {
        rank: UserRanks.GOLD,
        thresholdPoints: 896,
        requiredGifts: 0,
        requiredReferrals: 0,
        postQuota: 20,
      },
      qualifiedReferrals: 2,
      maintenanceCycle: {
        rank: UserRanks.SILVER,
        cycleStart: CycleStart,
        cycleEnd: CycleEnd,
        giftsDone: 2,
        referralsDone: 1,
        status: 'UNEVALUATED',
      },
    });
    expect(query.mock.calls[0][0]).toContain('FROM users user');
    expect(query.mock.calls[0][0]).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\b/i);
  });

  it('maps a missing point balance to lifetime zero', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        populatedRow({
          lifetime_points: null,
          maintenance_rank: null,
          cycle_start: null,
          cycle_end: null,
          gifts_done: null,
          referrals_done: null,
          maintenance_status: null,
        }),
      ])
      .mockResolvedValueOnce([
        {
          rank: UserRanks.GOLD,
          threshold_points: '896',
          required_gifts: '0',
          required_referrals: '0',
          post_quota: '20',
        },
      ]);
    const repository = new RankRepository({ query } as never);

    await expect(repository.getOwnSummary(UserId)).resolves.toMatchObject({
      lifetimePoints: 0,
      maintenanceCycle: null,
    });
  });

  it('does not query a next tier for Diamond', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      populatedRow({
        rank: UserRanks.DIAMOND,
        maintenance_rank: null,
        cycle_start: null,
        cycle_end: null,
        gifts_done: null,
        referrals_done: null,
        maintenance_status: null,
      }),
    ]);
    const repository = new RankRepository({ query } as never);

    await expect(repository.getOwnSummary(UserId)).resolves.toMatchObject({
      rank: UserRanks.DIAMOND,
      nextTier: null,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
