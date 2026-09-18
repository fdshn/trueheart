import { GetOwnPointSummaryUseCase } from './get-own-point-summary.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('GetOwnPointSummaryUseCase', () => {
  it('delegates the authenticated owner ID and returns a zero projection result', async () => {
    const ledger = {
      getSummary: jest.fn(async () => ({ balance: 0, lifetime: 0 })),
    };
    const useCase = new GetOwnPointSummaryUseCase(ledger as never);

    await expect(useCase.handle({ userId: UserId })).resolves.toEqual({
      point: { balance: 0, lifetime: 0 },
    });
    expect(ledger.getSummary).toHaveBeenCalledWith(UserId);
  });
});
