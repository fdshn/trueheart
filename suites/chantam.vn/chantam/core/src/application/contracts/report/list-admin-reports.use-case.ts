import {
  ReportReasons,
  ReportStatuses,
  ReportTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IListAdminReportsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListAdminReportsCommand {
  actorUserId: string;
  status?: ReportStatuses;
  targetType?: ReportTargetTypes;
  reason?: ReportReasons;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface IListAdminReportsResult extends IListAdminReportsResponseDto {}

export interface IListAdminReportsUseCase extends IUseCase<
  IListAdminReportsCommand,
  IListAdminReportsResult
> {}

export const IListAdminReportsUseCase = Symbol('IListAdminReportsUseCase');
