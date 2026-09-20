import { ReportReasons, ReportStatuses, ReportTargetTypes } from '../consts';

export interface IReport {
  reporterUserId: string;
  targetType: ReportTargetTypes;
  targetId: string;
  reason: ReportReasons;
  description: string;
  evidenceUrls: string[];
  status: ReportStatuses;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
}
