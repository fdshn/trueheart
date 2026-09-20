import { ReportReasons, ReportStatuses, ReportTargetTypes } from '../../consts';

export interface ICreateReportDto {
  targetType: ReportTargetTypes;
  targetId: string;
  reason: ReportReasons;
  description: string;
  evidenceUrls?: string[];
}

export interface ICreateReportBodyDto {
  report: ICreateReportDto;
}

export interface IReportDto {
  reportId: string;
  reporterUserId: string;
  reporterUsername: string;
  targetType: ReportTargetTypes;
  targetId: string;
  targetLabel: string;
  reason: ReportReasons;
  description: string;
  evidenceUrls: string[];
  status: ReportStatuses;
  targetOpenReportCount: number;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateReportResponseDto {
  report: IReportDto;
}

export interface IListAdminReportsResponseDto {
  reports: IReportDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface IGetAdminReportResponseDto {
  report: IReportDto;
}

export interface IReviewReportDto {
  status: ReportStatuses.RESOLVED | ReportStatuses.DISMISSED;
  note: string;
}

export interface IReviewReportBodyDto {
  review: IReviewReportDto;
}

export interface IReviewReportResponseDto {
  report: IReportDto;
}
