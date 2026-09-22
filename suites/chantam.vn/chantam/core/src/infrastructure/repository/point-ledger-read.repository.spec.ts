import { PointLedgerRepository } from './point-ledger.repository';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('PointLedgerRepository point reads', () => {
  it('reads the projection and returns zero values when no balance row exists', async () => {
    const query = jest.fn(async () => []);
    const repository = new PointLedgerRepository({ query } as never);

    await expect(repository.getSummary(UserId)).resolves.toEqual({
      balance: 0,
      rawBalance: 0,
      lifetime: 0,
      creditCount: 0,
      debitCount: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM user_point_balances'),
      [UserId],
    );
  });

  it('phơi số dư THẬT và số lần cộng/trừ tách khỏi số tiêu được', async () => {
    // Phạt 50 khi đang có 20: số tiêu được về 0, nhưng giá trị thật là -30.
    // Gộp hai con số làm một thì dòng log chỉ nói "về 0", và không ai biết
    // người đó hụt 30 hay hụt 300.
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { balance: '0', raw_balance: '-30', lifetime: '140' },
      ])
      .mockResolvedValueOnce([{ credits: '5', debits: '1' }]);
    const repository = new PointLedgerRepository({ query } as never);

    await expect(repository.getSummary(UserId)).resolves.toEqual({
      balance: 0,
      rawBalance: -30,
      lifetime: 140,
      creditCount: 5,
      debitCount: 1,
    });
  });

  it('đếm số lần cộng/trừ từ chính ledger, không từ cột đếm riêng', async () => {
    // Một bộ đếm riêng trên projection là con số thứ hai nói về cùng một sự
    // thật — sớm muộn lệch với ledger.
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { balance: '84', raw_balance: '84', lifetime: '140' },
      ])
      .mockResolvedValueOnce([{ credits: '3', debits: '0' }]);
    const repository = new PointLedgerRepository({ query } as never);

    await repository.getSummary(UserId);

    expect(String(query.mock.calls[1][0])).toContain('FROM point_ledger');
    expect(String(query.mock.calls[1][0])).toContain('FILTER (WHERE delta');
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
          raw_balance_after: '28',
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
          rawBalanceAfter: 28,
          note: '+28 điểm, còn 28 điểm',
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

  it('dựng câu log nói rõ đang âm bao nhiêu, không chỉ nói về 0', async () => {
    // Cột điểm chỉ hiện 0. Nếu dòng log cũng chỉ nói "về 0" thì người bị
    // phạt không biết mình hụt 30 hay hụt 300.
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '16',
          rule_code: 'SHIP_UNPAID_PENALTY',
          rule_version: '1',
          delta: '-50',
          balance_after: '0',
          raw_balance_after: '-30',
          lifetime_after: '20',
          source: 'SHIP_REPORT',
          reason: 'Hàng bị hoàn, không thanh toán phí ship',
          created_at: new Date('2026-09-20T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ total: '1' }]);
    const repository = new PointLedgerRepository({ query } as never);

    const page = await repository.getHistory(UserId, { skip: 0, take: 20 });

    expect(page.entries[0].balanceAfter).toBe(0);
    expect(page.entries[0].note).toBe('-50 điểm, đang âm 30 điểm');
  });
});
