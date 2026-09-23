import {
  ReportReasons,
  ReportStatuses,
  ReportTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IReportDto } from '@chantam.vn/chantam.core-lib/dto';
import { IReportEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface IFindAdminReportsParams {
  status?: ReportStatuses;
  targetType?: ReportTargetTypes;
  reason?: ReportReasons;
  keyword?: string;
  skip: number;
  take: number;
}

export interface IFindAdminReportsResult {
  items: IReportDto[];
  total: number;
}

export interface IReviewReportByAdminCommand {
  actorUserId: string;
  reportId: string;
  status: ReportStatuses.RESOLVED | ReportStatuses.DISMISSED;
  note: string;
}

export interface IReportRepository extends Repository<IReportEntity> {
  targetExists(
    targetType: ReportTargetTypes,
    targetId: string,
  ): Promise<boolean>;
  findOpenByReporterAndTarget(
    reporterUserId: string,
    targetType: ReportTargetTypes,
    targetId: string,
  ): Promise<IReportEntity | null>;
  findAdminReports(
    params: IFindAdminReportsParams,
  ): Promise<IFindAdminReportsResult>;
  findAdminByGlobalId(globalId: string): Promise<IReportDto | null>;
  reviewByAdmin(command: IReviewReportByAdminCommand): Promise<boolean>;
}

export const IReportRepository = Symbol('IReportRepository');
