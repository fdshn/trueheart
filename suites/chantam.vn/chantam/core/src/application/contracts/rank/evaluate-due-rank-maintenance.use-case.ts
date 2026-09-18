import { IUseCase } from '@chantam/service.common-lib';

export interface IEvaluateDueRankMaintenanceCommand {}

export interface IEvaluateDueRankMaintenanceResult {
  readonly processedCycles: number;
}

export interface IEvaluateDueRankMaintenanceUseCase extends IUseCase<
  IEvaluateDueRankMaintenanceCommand,
  IEvaluateDueRankMaintenanceResult
> {}

export const IEvaluateDueRankMaintenanceUseCase = Symbol(
  'IEvaluateDueRankMaintenanceUseCase',
);
