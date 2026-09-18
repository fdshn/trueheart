import { EvaluateDueRankMaintenanceUseCase } from './evaluate-due-rank-maintenance.use-case';

describe('EvaluateDueRankMaintenanceUseCase', () => {
  it('does not require an HTTP operator identity and delegates to the rank repository', async () => {
    const ranks = { evaluateDueMaintenanceCycles: jest.fn().mockResolvedValue(2) };
    const useCase = new EvaluateDueRankMaintenanceUseCase(ranks as never);

    await expect(useCase.handle({})).resolves.toEqual({ processedCycles: 2 });
    expect(ranks.evaluateDueMaintenanceCycles).toHaveBeenCalledTimes(1);
  });
});
