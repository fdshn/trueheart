import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { RankRepository } from './rank.repository';

const UserId = '10000000-0000-4000-8000-000000000001';
const CycleStart = new Date('2026-01-01T00:00:00.000Z');
const CycleEnd = new Date('2026-04-01T00:00:00.000Z');

function dueCycle(overrides = {}) {
  return {
    id: '51',
    user_id: UserId,
    rank: UserRanks.SILVER,
    cycle_start: CycleStart,
    cycle_end: CycleEnd,
    ...overrides,
  };
}

function lockedUser(overrides = {}) {
  return {
    rank: UserRanks.SILVER,
    lifetime_points: '700',
    maintenance_gifts: '2',
    maintenance_referrals: '2',
    qualified_referrals: '2',
    ...overrides,
  };
}

function makeRepository(
  query: jest.Mock,
  activity: { countCompletedGifts: jest.Mock },
): RankRepository {
  return new RankRepository(
    { transaction: async (callback: (manager: { query: jest.Mock }) => unknown) => callback({ query }) } as never,
    activity as never,
  );
}

describe('RankRepository due maintenance evaluation', () => {
  it('claims due open cycles with SKIP LOCKED, finalizes unavailable activity once without a transition, and opens its next cycle idempotently', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([dueCycle()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lockedUser()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const activity = { countCompletedGifts: jest.fn().mockResolvedValue({ available: false }) };
    const repository = makeRepository(query, activity);

    await expect(repository.evaluateDueMaintenanceCycles()).resolves.toBe(1);

    expect(query.mock.calls[0][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.mock.calls[1]).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [UserId],
    ]);
    expect(activity.countCompletedGifts).toHaveBeenCalledWith({
      userId: UserId,
      cycleStart: CycleStart,
      cycleEnd: CycleEnd,
      rank: UserRanks.SILVER,
    });
    expect(query.mock.calls[3][1]).toEqual(['51', 0, 2, 'UNEVALUATED']);
    expect(query.mock.calls[3][0]).not.toMatch(/rank_transitions/i);
    expect(query.mock.calls[4][0]).toMatch(/INSERT INTO rank_maintenance_cycles[\s\S]*ON CONFLICT DO NOTHING/i);
    expect(query.mock.calls.flatMap((call) => call).join('\n')).not.toMatch(/point_ledger/i);
  });

  it('finalizes satisfied available activity without a transition and opens the next cycle', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([dueCycle()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lockedUser()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const activity = { countCompletedGifts: jest.fn().mockResolvedValue({ available: true, completedGifts: 2 }) };
    const repository = makeRepository(query, activity);

    await expect(repository.evaluateDueMaintenanceCycles()).resolves.toBe(1);

    expect(query.mock.calls[3][1]).toEqual(['51', 2, 2, 'SATISFIED']);
    expect(query.mock.calls.flatMap((call) => call).join('\n')).not.toMatch(/INSERT INTO rank_transitions/i);
    expect(query.mock.calls[4][0]).toContain('INSERT INTO rank_maintenance_cycles');
  });

  it('demotes failed available activity exactly one rank, writes the immutable transition linked to the cycle, and opens the next cycle', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([dueCycle({ rank: UserRanks.GOLD })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lockedUser({ rank: UserRanks.GOLD, maintenance_gifts: '3', maintenance_referrals: '3', qualified_referrals: '0' })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const activity = { countCompletedGifts: jest.fn().mockResolvedValue({ available: true, completedGifts: 0 }) };
    const repository = makeRepository(query, activity);

    await expect(repository.evaluateDueMaintenanceCycles()).resolves.toBe(1);

    expect(query.mock.calls[3][1]).toEqual(['51', 0, 0, 'FAILED']);
    expect(query.mock.calls[4]).toEqual([
      expect.stringContaining('UPDATE users'),
      [UserId, UserRanks.SILVER, UserRanks.GOLD],
    ]);
    expect(query.mock.calls[5]).toEqual([
      expect.stringContaining('INSERT INTO rank_transitions'),
      [UserId, UserRanks.GOLD, UserRanks.SILVER, 'MAINTENANCE_FAILED', 700, '51', 'SYSTEM'],
    ]);
    expect(query.mock.calls[6][0]).toContain('INSERT INTO rank_maintenance_cycles');
  });
});
