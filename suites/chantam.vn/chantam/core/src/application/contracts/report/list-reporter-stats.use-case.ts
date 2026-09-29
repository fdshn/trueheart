import { IReporterStats } from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListReporterStatsCommand {
  /** Chỉ trả người đã vượt ngưỡng. Mặc định `true`. */
  abusiveOnly?: boolean;
  limit?: number;
}

export interface IListReporterStatsResult {
  reporters: IReporterStats[];
  /** Ngưỡng đang áp, trả kèm để Admin biết con số `abusive` dựa trên đâu. */
  minReports: number;
  dismissedRatioPercent: number;
}

export interface IListReporterStatsUseCase extends IUseCase<
  IListReporterStatsCommand,
  IListReporterStatsResult
> {}

export const IListReporterStatsUseCase = Symbol('IListReporterStatsUseCase');
