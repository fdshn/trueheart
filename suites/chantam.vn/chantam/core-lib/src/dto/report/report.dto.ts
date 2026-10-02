import { ReportReasons, ReportStatuses, ReportTargetTypes } from '../../consts';
import { ReportEnforcementAction } from '../../models/report-enforcement';

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
  /**
   * Chế tài áp CÙNG LÚC với kết luận (F49, mục mở L4).
   *
   * Bỏ trống nghĩa là không chế tài — đúng hành vi của đường cũ. Chỉ hợp lệ khi `status`
   * là `RESOLVED`.
   */
  enforcement?: IReportEnforcementDto;
}

export interface IReportEnforcementDto {
  action: ReportEnforcementAction;
  /** Bắt buộc với `SUSPEND_USER`, bỏ qua với mọi giá trị khác. */
  suspendDays?: number | null;
}

export interface IReportEnforcementOutcomeDto {
  action: ReportEnforcementAction;
  /** Tài khoản đã bị áp chế tài, `null` khi không áp gì. */
  targetUserId: string | null;
  /** Trạng thái tài khoản sau khi áp. */
  userStatus: string | null;
  suspendedUntil: Date | null;
  /**
   * Số phiên đã bị thu hồi.
   *
   * ROADMAP ghi rõ *"chế tài nào đổi `status` thì cũng phải thu hồi token như F60"*, nên
   * con số này là bằng chứng việc đó đã xảy ra — không phải một lời hứa trong docblock.
   */
  revokedSessions: number;
}

export interface IReviewReportResponseDto {
  report: IReportDto;
  /**
   * Kết quả chế tài.
   *
   * Luôn có mặt, kể cả khi không chế tài gì (`action: 'NONE'`). Trả `undefined` ở ca không
   * chế tài sẽ buộc client phân biệt "không áp" với "thiếu trường", mà hai cái đó khác
   * nhau khi đọc lại một response cũ.
   */
  enforcement: IReportEnforcementOutcomeDto;
}
