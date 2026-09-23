import { IGetAdminReportResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetAdminReportCommand {
  actorUserId: string;
  reportId: string;
}

export interface IGetAdminReportResult extends IGetAdminReportResponseDto {}

export interface IGetAdminReportUseCase extends IUseCase<
  IGetAdminReportCommand,
  IGetAdminReportResult
> {}

export const IGetAdminReportUseCase = Symbol('IGetAdminReportUseCase');
