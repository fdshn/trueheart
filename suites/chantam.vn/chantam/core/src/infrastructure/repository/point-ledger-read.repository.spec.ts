import { PointLedgerRepository } from './point-ledger.repository';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('PointLedgerRepository point reads', () => {
  it('reads the projection and returns zero values when no balance row exists', async () => {
    const query = jest.fn(async () => []);
    const repository = new PointLedgerRepository({ query } as never);

    await expect(repository.getSummary(UserId)).resolves.toEqual({
      balance: 0,
      lifetime: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM user_point_balances'),
      [UserId],
    );
  });

  it('reads only the owner history newest first with total and numeric conversion', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '15',
          rule_code: 'PHONE_VERIFIED_FIRST_TIME',
          rule_version: '1',
          delta: '28',
          balance_after: '28',
          lifetime_after: '28',
          source: 'PROFILE',
          reason: null,
          created_at: new Date('2026-09-18T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ total: '1' }]);
    const repository = new PointLedgerRepository({ query } as never);

    await expect(
      repository.getHistory(UserId, { skip: 0, take: 20 }),
    ).resolves.toEqual({
      entries: [
        {
          entryId: 15,
          ruleCode: 'PHONE_VERIFIED_FIRST_TIME',
          ruleVersion: 1,
          delta: 28,
          balanceAfter: 28,
          lifetimeAfter: 28,
          source: 'PROFILE',
          reason: null,
          createdAt: new Date('2026-09-18T00:00:00.000Z'),
        },
      ],
      total: 1,
    });
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining('WHERE user_id = $1'),
      [UserId, 20, 0],
    ]);
    expect(query.mock.calls[0][0]).toContain(
      'ORDER BY created_at DESC, id DESC',
    );
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('COUNT(*)'),
      [UserId],
    ]);
  });
});
