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
  /**
   * Thống kê người báo xấu, tính SỐNG từ bảng `reports`.
   *
   * **Cố ý không lưu thành cột trên `users`.** Chỉ Admin đọc con số này, nên không
   * có áp lực hiệu năng để phải lưu sẵn — mà lưu sẵn thì kéo theo ba thứ: một
   * migration backfill, một đường tính lại mỗi khi có kết luận mới, và một job đối
   * soát cho lần Admin đổi ngưỡng. Đúng ba thứ mà `giver_accuracy_*` đang phải
   * mang. Tính sống thì con số KHÔNG BAO GIỜ lệch được với nguồn, và đổi ngưỡng có
   * hiệu lực ngay.
   *
   * Xếp theo tỷ lệ bị bác giảm dần: người đáng xem nằm trên.
   */
  findReporterStats(params: {
    /** Chỉ trả người đã vượt ngưỡng. `false` thì trả mọi người có lượt báo. */
    abusiveOnly: boolean;
    limit: number;
  }): Promise<IReporterStats[]>;
  /**
   * Chủ của nội dung bị báo, để gửi thông báo khi Admin xử lý.
   *
   * `null` khi đích không còn tồn tại — nội dung có thể đã bị gỡ trước đó, và
   * không tìm được chủ thì bỏ qua thông báo chứ không làm hỏng việc kết luận.
   */
  findTargetOwner(
    targetType: ReportTargetTypes,
    targetId: string,
  ): Promise<string | null>;

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

/** Một dòng trong màn "người báo xấu" của Admin. */
export interface IReporterStats {
  readonly userId: string;
  readonly username: string;
  /** Tổng số lượt báo đã gửi, kể cả đang chờ xử lý. */
  readonly totalReports: number;
  /** Số lượt ĐÃ có kết luận — mẫu để tính tỷ lệ. */
  readonly reviewedReports: number;
  readonly dismissedReports: number;
  readonly resolvedReports: number;
  /** Phần trăm bị bác trên số lượt đã có kết luận. `null` khi chưa có lượt nào. */
  readonly dismissedRatioPercent: number | null;
  /** `true` khi đủ mẫu VÀ vượt ngưỡng — diện Admin xem xét. */
  readonly abusive: boolean;
}

export const IReportRepository = Symbol('IReportRepository');
