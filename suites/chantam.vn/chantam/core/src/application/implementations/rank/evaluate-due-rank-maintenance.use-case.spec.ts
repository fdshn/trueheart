import { EvaluateDueRankMaintenanceUseCase } from './evaluate-due-rank-maintenance.use-case';

describe('EvaluateDueRankMaintenanceUseCase', () => {
  it('delegates once to rank maintenance evaluation and returns its processed count', async () => {
    const ranks = { evaluateDueMaintenanceCycles: jest.fn().mockResolvedValue(3) };
    const useCase = new EvaluateDueRankMaintenanceUseCase(ranks as never);

    await expect(useCase.handle({})).resolves.toEqual({ processedCycles: 3 });
    expect(ranks.evaluateDueMaintenanceCycles).toHaveBeenCalledTimes(1);
  });
});
