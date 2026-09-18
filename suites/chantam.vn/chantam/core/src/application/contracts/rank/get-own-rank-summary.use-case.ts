import { IGetOwnRankSummaryResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetOwnRankSummaryCommand {
  userId: string;
}

export type IGetOwnRankSummaryResult = IGetOwnRankSummaryResponseDto;

export interface IGetOwnRankSummaryUseCase extends IUseCase<
  IGetOwnRankSummaryCommand,
  IGetOwnRankSummaryResult
> {}

export const IGetOwnRankSummaryUseCase = Symbol('IGetOwnRankSummaryUseCase');
