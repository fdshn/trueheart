import { EvaluateDueRankMaintenanceUseCase } from './evaluate-due-rank-maintenance.use-case';

describe('EvaluateDueRankMaintenanceUseCase — không cần danh tính HTTP', () => {
  it('chạy được từ CLI, không đòi operator nào', async () => {
    const ranks = {
      evaluateDueMaintenanceCycles: jest.fn().mockResolvedValue(2),
      findUnpenalizedFailedCycles: jest.fn().mockResolvedValue([]),
      reconcileNormalRank: jest.fn(),
    };
    const ledger = { appendAdjustment: jest.fn() };
    const useCase = new EvaluateDueRankMaintenanceUseCase(
      ranks as never,
      ledger as never,
    );

    await expect(useCase.handle({})).resolves.toEqual({
      processedCycles: 2,
      penalties: [],
    });
    expect(ranks.evaluateDueMaintenanceCycles).toHaveBeenCalledTimes(1);
  });
});
