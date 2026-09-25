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
    required_gifts: '2',
    required_referrals: '2',
    policy_version: '1',
    ...overrides,
  };
}

function lockedUser(overrides = {}) {
  return {
    rank: UserRanks.SILVER,
    balance_points: '700',
    qualified_referrals: '2',
    total_qualified_referrals: '2',
    ...overrides,
  };
}

function makeRepository(
  query: jest.Mock,
  activity: {
    countCompletedGifts: jest.Mock;
    countLifetimeCompletedGifts?: jest.Mock;
  },
): RankRepository {
  return new RankRepository(
    {
      transaction: async (
        callback: (manager: { query: jest.Mock }) => unknown,
      ) => callback({ query }),
    } as never,
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
    const activity = {
      countCompletedGifts: jest.fn().mockResolvedValue({ available: false }),
    };
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
    expect(query.mock.calls[0][0]).toMatch(
      /required_gifts, required_referrals, policy_version/i,
    );
    expect(query.mock.calls[2][0]).not.toMatch(/JOIN rank_tiers/i);
    expect(query.mock.calls[2][0]).toMatch(
      /referral\.qualified_at >= \$2[\s\S]*referral\.qualified_at < \$3/i,
    );
    // `cycle.rank` KHÔNG nằm trong tham số: câu này không dùng tới nó, và một
    // tham số không xuất hiện trong câu lệnh làm Postgres không suy được kiểu
    // (42P18). Lỗi đó nằm im từ đầu vì đoạn này chưa từng chạy thật.
    expect(query.mock.calls[2][1]).toEqual([UserId, CycleStart, CycleEnd]);
    expect(query.mock.calls[3][0]).not.toMatch(/rank_transitions/i);
    expect(query.mock.calls[4][0]).toMatch(
      /INSERT INTO rank_maintenance_cycles[\s\S]*ON CONFLICT DO NOTHING/i,
    );
    expect(query.mock.calls.flatMap((call) => call).join('\n')).not.toMatch(
      /point_ledger/i,
    );
  });

  it('finalizes satisfied available activity without a transition and opens the next cycle', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([dueCycle()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lockedUser()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const activity = {
      countCompletedGifts: jest
        .fn()
        .mockResolvedValue({ available: true, completedGifts: 2 }),
    };
    const repository = makeRepository(query, activity);

    await expect(repository.evaluateDueMaintenanceCycles()).resolves.toBe(1);

    expect(query.mock.calls[3][1]).toEqual(['51', 2, 2, 'SATISFIED']);
    expect(query.mock.calls.flatMap((call) => call).join('\n')).not.toMatch(
      /INSERT INTO rank_transitions/i,
    );
    expect(query.mock.calls[4][0]).toContain(
      'INSERT INTO rank_maintenance_cycles',
    );
  });

  it('trượt nhiệm vụ chỉ đánh FAILED, KHÔNG tự đổi hạng', async () => {
    // Chốt 2026-09-24: hạng do balance quyết, nên nhiệm vụ tác động gián tiếp
    // qua điểm. Khoản trừ do tầng ứng dụng áp sau đó rồi gọi
    // `reconcileNormalRank`. Ép tụt hạng ở đây là tạo hai cơ chế cùng quyết một
    // thứ, rồi lần xét kế tiếp đẩy người ta ngược lên.
    const query = jest
      .fn()
      .mockResolvedValueOnce([dueCycle({ rank: UserRanks.GOLD })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        lockedUser({
          rank: UserRanks.GOLD,
          maintenance_gifts: '3',
          maintenance_referrals: '3',
          qualified_referrals: '0',
          total_qualified_referrals: '0',
        }),
      ])
      .mockResolvedValue([]);
    const activity = {
      countCompletedGifts: jest
        .fn()
        .mockResolvedValue({ available: true, completedGifts: 0 }),
      countLifetimeCompletedGifts: jest
        .fn()
        .mockResolvedValue({ available: true, completedGifts: 0 }),
    };
    const repository = makeRepository(query, activity);

    await expect(repository.evaluateDueMaintenanceCycles()).resolves.toBe(1);

    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(
      statements.some((sql) => sql.includes('UPDATE rank_maintenance_cycles')),
    ).toBe(true);
    expect(query.mock.calls[3][1]).toEqual(['51', 0, 0, 'FAILED']);

    // Hai thứ KHÔNG được xảy ra ở đây nữa.
    expect(statements.some((sql) => sql.includes('UPDATE users'))).toBe(false);
    expect(
      statements.some((sql) => sql.includes('INSERT INTO rank_transitions')),
    ).toBe(false);
  });

  it('KHÔNG còn truy vấn các bậc thấp hơn để ép tụt', async () => {
    // Câu `threshold_points < (...)` là dấu vết của cơ chế cũ. Còn nó nghĩa là
    // ai đó đã đưa việc ép tụt hạng trở lại.
    const query = jest
      .fn()
      .mockResolvedValueOnce([dueCycle({ rank: UserRanks.GOLD })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        lockedUser({
          rank: UserRanks.GOLD,
          maintenance_gifts: '3',
          maintenance_referrals: '3',
          qualified_referrals: '0',
          total_qualified_referrals: '0',
        }),
      ])
      .mockResolvedValue([]);
    const repository = makeRepository(query, {
      countCompletedGifts: jest
        .fn()
        .mockResolvedValue({ available: true, completedGifts: 0 }),
      countLifetimeCompletedGifts: jest
        .fn()
        .mockResolvedValue({ available: true, completedGifts: 0 }),
    });

    await repository.evaluateDueMaintenanceCycles();

    expect(
      query.mock.calls
        .map((call) => String(call[0]))
        .some((sql) => sql.includes('threshold_points <')),
    ).toBe(false);
  });
});
