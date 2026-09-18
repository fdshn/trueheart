import { IGetOwnPointSummaryResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetOwnPointSummaryCommand {
  userId: string;
}

export interface IGetOwnPointSummaryUseCase extends IUseCase<
  IGetOwnPointSummaryCommand,
  IGetOwnPointSummaryResponseDto
> {}

export const IGetOwnPointSummaryUseCase = Symbol('IGetOwnPointSummaryUseCase');
