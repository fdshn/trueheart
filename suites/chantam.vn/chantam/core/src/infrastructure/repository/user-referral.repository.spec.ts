import { UserRepository } from './user.repository';

const Params = {
  globalId: '10000000-0000-4000-8000-000000000001',
  username: 'new-member',
  passwordHash: 'hash',
  referralCode: 'UNKNOWN000',
};

describe('UserRepository referral registration', () => {
  it('creates a user and silently ignores an unknown referral code in one transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ global_id: Params.globalId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ referral_code: 'AB12CD34EF' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { global_id: Params.globalId, username: Params.username },
      ]);
    const manager = { query };
    const rootManager = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const repository = new UserRepository({} as never, rootManager as never);

    const result = await repository.createWithReferral(Params);

    expect(rootManager.transaction).toHaveBeenCalledTimes(1);
    expect(result.referralApplied).toBe(false);
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).toContain(
      'INSERT INTO users',
    );
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).not.toContain(
      'INSERT INTO referrals',
    );
  });
});
