import { AppendPointEntryUseCase } from './append-point-entry.use-case';

const Command = {
  userId: '10000000-0000-4000-8000-000000000001',
  ruleCode: 'PHONE_VERIFIED_FIRST_TIME',
  referenceType: 'PHONE_VERIFICATION',
  referenceId: '10000000-0000-4000-8000-000000000001',
  idempotencyKey:
    'PHONE_VERIFIED_FIRST_TIME:10000000-0000-4000-8000-000000000001',
  actor: 'SYSTEM',
  source: 'PROFILE',
};

describe('AppendPointEntryUseCase', () => {
  it('delegates a rule-derived idempotent award without accepting caller-controlled points', async () => {
    const ledger = {
      appendByRule: jest.fn(async () => ({
        entryId: 1,
        balance: 28,
        lifetime: 28,
      })),
    };
    const useCase = new AppendPointEntryUseCase(ledger as never);

    const result = await useCase.handle(Command);

    expect(ledger.appendByRule).toHaveBeenCalledWith(Command);
    expect(result).toEqual({ entryId: 1, balance: 28, lifetime: 28 });
  });
});
