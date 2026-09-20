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
      .mockResolvedValueOnce([]);
    const manager = {
      query,
      findOneBy: jest.fn(async () => ({
        globalId: Params.globalId,
        username: Params.username,
      })),
    };
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

  it('trả về user dùng được ngay, không phải hàng thô snake_case', async () => {
    // Đăng ký xong là phát session luôn, mà SessionIssuer đọc `user.globalId`.
    // Đọc bằng `SELECT *` thì hàng trả về là snake_case, trường đó undefined,
    // và session insert `user_id` NULL — đăng ký trả 500.
    const mapped = {
      globalId: Params.globalId,
      username: Params.username,
      status: 'ACTIVE',
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ global_id: Params.globalId }]);
    const findOneBy = jest.fn(async () => mapped);
    const rootManager = {
      transaction: jest.fn(async (callback) => callback({ query, findOneBy })),
    };
    const repository = new UserRepository({} as never, rootManager as never);

    const { user } = await repository.createWithReferral({
      ...Params,
      referralCode: undefined,
    });

    expect(user?.globalId).toBe(Params.globalId);
    expect(findOneBy).toHaveBeenCalledWith(expect.anything(), {
      globalId: Params.globalId,
    });
    // Không được đọc lại user bằng raw SELECT — đó chính là nguồn của hàng thô.
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).not.toMatch(
      /SELECT\s+\*\s+FROM\s+users/i,
    );
  });
});
