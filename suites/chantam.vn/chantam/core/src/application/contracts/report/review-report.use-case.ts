import {
  IReviewReportBodyDto,
  IReviewReportResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IReviewReportCommand extends IReviewReportBodyDto {
  actorUserId: string;
  reportId: string;
}

export interface IReviewReportResult extends IReviewReportResponseDto {}

export interface IReviewReportUseCase extends IUseCase<
  IReviewReportCommand,
  IReviewReportResult
> {}

export const IReviewReportUseCase = Symbol('IReviewReportUseCase');
