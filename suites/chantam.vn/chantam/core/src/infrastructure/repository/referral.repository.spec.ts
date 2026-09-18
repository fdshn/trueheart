import { PointLedgerRepository } from './point-ledger.repository';
import { ReferralRepository } from './referral.repository';

const RefereeId = '10000000-0000-4000-8000-000000000001';

describe('ReferralRepository', () => {
  it('qualifies once and appends the reward in the same transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { referrer_id: '20000000-0000-4000-8000-000000000002' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { points: 56, affects_lifetime: true, version: 1, daily_cap: 3 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ balance: 0, lifetime: 0 }])
      .mockResolvedValueOnce([{ id: '2' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '1' }]);
    const manager = { query };
    const rootManager = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const ledger = new PointLedgerRepository(rootManager as never);
    const referrals = new ReferralRepository(rootManager as never, ledger);

    const qualified = await referrals.qualifyAndAward({ refereeId: RefereeId });

    expect(qualified).toBe(true);
    expect(rootManager.transaction).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('UPDATE referrals');
    expect(sql).toContain('INSERT INTO point_ledger');
  });
});
