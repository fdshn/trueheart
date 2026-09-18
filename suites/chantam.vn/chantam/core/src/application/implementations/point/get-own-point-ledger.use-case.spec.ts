import { GetOwnPointLedgerUseCase } from './get-own-point-ledger.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('GetOwnPointLedgerUseCase', () => {
  it('maps page parameters to skip/take and delegates the authenticated owner ID', async () => {
    const ledger = {
      getHistory: jest.fn(async () => ({ entries: [], total: 31 })),
    };
    const useCase = new GetOwnPointLedgerUseCase(ledger as never);

    await expect(
      useCase.handle({ userId: UserId, page: 3, pageSize: 10 }),
    ).resolves.toMatchObject({
      entries: [],
      meta: { page: 3, pageSize: 10, total: 31 },
    });
    expect(ledger.getHistory).toHaveBeenCalledWith(UserId, {
      skip: 20,
      take: 10,
    });
  });
});
