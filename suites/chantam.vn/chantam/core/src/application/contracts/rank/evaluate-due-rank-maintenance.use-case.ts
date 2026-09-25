import { IUseCase } from '@chantam/service.common-lib';

export interface IEvaluateDueRankMaintenanceCommand {}

export interface IAppliedMaintenancePenalty {
  readonly cycleId: string;
  readonly userId: string;
  readonly rank: string;
  readonly points: number;
  /** `true` khi khoản trừ kéo người này xuống bậc thấp hơn. */
  readonly demoted: boolean;
}

export interface IEvaluateDueRankMaintenanceResult {
  readonly processedCycles: number;
  /**
   * Khoản trừ đã áp cho các chu kỳ trượt.
   *
   * Gồm cả chu kỳ trượt từ những lần chạy TRƯỚC mà chưa bị trừ — tiến trình
   * chết giữa hai bước là mất khoản trừ vĩnh viễn nếu không vá lại.
   */
  readonly penalties: IAppliedMaintenancePenalty[];
}

export interface IEvaluateDueRankMaintenanceUseCase extends IUseCase<
  IEvaluateDueRankMaintenanceCommand,
  IEvaluateDueRankMaintenanceResult
> {}

export const IEvaluateDueRankMaintenanceUseCase = Symbol(
  'IEvaluateDueRankMaintenanceUseCase',
);
