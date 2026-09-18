import { UserNotFoundException } from '@/domain/exceptions';
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

  it('transactionally promotes a locked Viewer and records its immutable audit row', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { rank: UserRanks.VIEWER, lifetime_points: '224' },
      ])
      .mockResolvedValueOnce([{ global_id: UserId }])
      .mockResolvedValueOnce([]);
    const transaction = jest.fn(async (callback) => callback({ query }));
    const repository = new RankRepository({ transaction } as never);

    await expect(repository.promoteMemberOnboarding(UserId)).resolves.toBe(
      true,
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [UserId],
    ]);
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][0]).toContain('user_point_balances');
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining('UPDATE users'),
      [UserId, UserRanks.MEMBER, UserRanks.VIEWER],
    ]);
    expect(query.mock.calls[3]).toEqual([
      expect.stringContaining('INSERT INTO rank_transitions'),
      [
        UserId,
        UserRanks.VIEWER,
        UserRanks.MEMBER,
        'ONBOARDING_COMPLETE',
        224,
        'SYSTEM',
      ],
    ]);
    expect(query.mock.calls[3][0]).not.toMatch(
      /rank_maintenance_cycles|point_ledger/i,
    );
  });

  it('uses zero lifetime points when the user has no balance row', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { rank: UserRanks.VIEWER, lifetime_points: null },
      ])
      .mockResolvedValueOnce([{ global_id: UserId }])
      .mockResolvedValueOnce([]);
    const repository = new RankRepository({
      transaction: async (callback) => callback({ query }),
    } as never);

    await expect(repository.promoteMemberOnboarding(UserId)).resolves.toBe(
      true,
    );
    expect(query.mock.calls[3][1]).toContain(0);
  });

  it('does nothing for Member or higher without rank update or transition insert', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { rank: UserRanks.MEMBER, lifetime_points: '224' },
      ]);
    const repository = new RankRepository({
      transaction: async (callback) => callback({ query }),
    } as never);

    await expect(repository.promoteMemberOnboarding(UserId)).resolves.toBe(
      false,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('throws UserNotFoundException for a missing user', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const repository = new RankRepository({
      transaction: async (callback) => callback({ query }),
    } as never);

    await expect(
      repository.promoteMemberOnboarding(UserId),
    ).rejects.toBeInstanceOf(UserNotFoundException);
  });

  it('keeps the current rank and creates neither audit nor cycle when normal gift activity is unavailable', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          rank: UserRanks.MEMBER,
          lifetime_points: '700',
          promotion_locked_until: null,
          qualified_referrals: '1',
        },
      ])
      .mockResolvedValueOnce([
        {
          rank: UserRanks.MEMBER,
          threshold_points: '224',
          required_gifts: '0',
          required_referrals: '0',
        },
        {
          rank: UserRanks.SILVER,
          threshold_points: '672',
          required_gifts: '1',
          required_referrals: '1',
        },
      ]);
    const activity = {
      countLifetimeCompletedGifts: jest
        .fn()
        .mockResolvedValue({ available: false }),
    };
    const repository = new RankRepository(
      {
        transaction: async (isolationOrCallback, callback?) =>
          (typeof isolationOrCallback === 'function'
            ? isolationOrCallback
            : callback)!({ query }),
      } as never,
      activity as never,
    );

    await expect(repository.reconcileNormalRank(UserId)).resolves.toBe(false);

    expect(query.mock.calls[0]).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [UserId],
    ]);
    expect(activity.countLifetimeCompletedGifts).toHaveBeenCalledWith({
      userId: UserId,
      rank: UserRanks.MEMBER,
    });
    expect(query.mock.calls.flatMap((call) => call).join('\n')).not.toMatch(
      /UPDATE users|rank_transitions|rank_maintenance_cycles/i,
    );
  });

  it('promotes Member to Silver with an immutable normal audit and initial three-month cycle when activity becomes available', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          rank: UserRanks.MEMBER,
          lifetime_points: '700',
          promotion_locked_until: null,
          qualified_referrals: '1',
        },
      ])
      .mockResolvedValueOnce([
        {
          rank: UserRanks.MEMBER,
          threshold_points: '224',
          required_gifts: '0',
          required_referrals: '0',
        },
        {
          rank: UserRanks.SILVER,
          threshold_points: '672',
          required_gifts: '1',
          required_referrals: '1',
        },
      ])
      .mockResolvedValueOnce([{ global_id: UserId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const activity = {
      countLifetimeCompletedGifts: jest
        .fn()
        .mockResolvedValue({ available: true, completedGifts: 1 }),
    };
    const repository = new RankRepository(
      {
        transaction: async (isolationOrCallback, callback?) =>
          (typeof isolationOrCallback === 'function'
            ? isolationOrCallback
            : callback)!({ query }),
      } as never,
      activity as never,
    );

    await expect(repository.reconcileNormalRank(UserId)).resolves.toBe(true);

    expect(query.mock.calls[3]).toEqual([
      expect.stringContaining('UPDATE users'),
      [UserId, UserRanks.SILVER, UserRanks.MEMBER],
    ]);
    expect(query.mock.calls[4]).toEqual([
      expect.stringContaining('INSERT INTO rank_transitions'),
      [
        UserId,
        UserRanks.MEMBER,
        UserRanks.SILVER,
        'NORMAL_QUALIFICATION',
        700,
        'SYSTEM',
      ],
    ]);
    expect(query.mock.calls[5][0]).toMatch(
      /INSERT INTO rank_maintenance_cycles[\s\S]*interval '3 months'[\s\S]*ON CONFLICT DO NOTHING/i,
    );
    expect(query.mock.calls[5][1]).toEqual([UserId, UserRanks.SILVER]);
  });

  it('is idempotent after a normal promotion retry and writes no duplicate transition or cycle', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          rank: UserRanks.SILVER,
          lifetime_points: '700',
          promotion_locked_until: null,
          qualified_referrals: '1',
        },
      ])
      .mockResolvedValueOnce([
        {
          rank: UserRanks.MEMBER,
          threshold_points: '224',
          required_gifts: '0',
          required_referrals: '0',
        },
        {
          rank: UserRanks.SILVER,
          threshold_points: '672',
          required_gifts: '1',
          required_referrals: '1',
        },
      ]);
    const activity = {
      countLifetimeCompletedGifts: jest
        .fn()
        .mockResolvedValue({ available: true, completedGifts: 1 }),
    };
    const repository = new RankRepository(
      {
        transaction: async (isolationOrCallback, callback?) =>
          (typeof isolationOrCallback === 'function'
            ? isolationOrCallback
            : callback)!({ query }),
      } as never,
      activity as never,
    );

    await expect(repository.reconcileNormalRank(UserId)).resolves.toBe(false);

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.flatMap((call) => call).join('\n')).not.toMatch(
      /UPDATE users|rank_transitions|rank_maintenance_cycles/i,
    );
  });
});
