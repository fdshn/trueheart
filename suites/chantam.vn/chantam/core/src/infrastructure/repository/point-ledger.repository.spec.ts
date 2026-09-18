import { PointLedgerRepository } from './point-ledger.repository';

const Command = {
  userId: '10000000-0000-4000-8000-000000000001',
  ruleCode: 'PHONE_VERIFIED_FIRST_TIME',
  referenceType: 'PHONE_VERIFICATION',
  referenceId: '10000000-0000-4000-8000-000000000001',
  idempotencyKey: 'PHONE_VERIFIED_FIRST_TIME:10000000-0000-4000-8000-000000000001',
  actor: 'SYSTEM',
  source: 'PROFILE',
};

describe('PointLedgerRepository', () => {
  it('locks the user and inserts an award from the persisted rule exactly once', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          points: 28,
          affects_lifetime: true,
          version: 1,
          daily_cap: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { balance: 0, lifetime: 0 },
      ])
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const manager = { query };
    const rootManager = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const repository = new PointLedgerRepository(rootManager as never);

    const result = await repository.appendByRule(Command);

    expect(query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [Command.userId],
    );
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).toContain(
      'INSERT INTO point_ledger',
    );
    expect(result).toEqual({ entryId: 1, balance: 28, lifetime: 28 });
  });
});
