import {
  IAdminAuditSummary,
  ISystemConfigSummary,
} from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';
import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IGetAdminConfigsCommand {
  actorUserId: string;
}
export interface IGetAdminConfigsResult {
  configs: ISystemConfigSummary[];
}
export interface IGetAdminConfigsUseCase extends IUseCase<
  IGetAdminConfigsCommand,
  IGetAdminConfigsResult
> {}
export const IGetAdminConfigsUseCase = Symbol('IGetAdminConfigsUseCase');

export interface IPublishAdminConfigBodyDto {
  key: string;
  value: unknown;
  valueType: string;
  reason: string;
}

export const SupportedSystemConfigKeys = [
  'discovery.default_radius_meters',
  'discovery.min_radius_meters',
  'discovery.max_radius_meters',
  'group.default_radius_meters',
  'group.min_radius_meters',
  'group.max_radius_meters',
  // Bán kính riêng theo bậc. Thiếu khoá của bậc nào thì bậc đó dùng
  // `group.default_radius_meters` — xem `groupRadiusConfigKeyForRank`.
  'group.radius_meters.member',
  'group.radius_meters.silver',
  'group.radius_meters.gold',
  'group.radius_meters.diamond',
  'affiliate.active_member_window_days',
  'rank.maintenance_period_months',
  'accuracy.giver',
  // Ngưỡng diện xem xét cho dấu vết đăng ký trùng (23 §23.7).
  //
  // Phải có ở đây, không chỉ ở `system_configs`: cả thiết kế dựa trên việc Bên A BẬT
  // nó khi đã có dữ liệu, và một khoá seed sẵn mà không nằm trong danh sách này thì
  // chỉ đổi được bằng SQL tay — đúng thứ "cấu hình động" sinh ra để tránh.
  'referral.review_min_qualified',
  'referral.review_min_device_clusters',
  'referral.review_min_cluster_size',
] as const;

/**
 * Khoảng hợp lệ cho từng khoá, đơn vị đúng như tên khoá nói.
 *
 * Chỉ khai ở đây những khoá có cận CỨNG ở tầng dưới — một ràng buộc database,
 * một cột int, một thứ mà vượt ra là sập chứ không phải là lạ. Khoá không có cận
 * như vậy thì để trống: bịa ra một khoảng là đặt chính sách thay Bên A.
 *
 * Ba khoá `group.*` ở đây vì cột `groups.radius_km` có
 * `CHK_groups_radius CHECK (radius_km BETWEEN 1 AND 50)`. Thiếu phép kiểm này,
 * Admin đặt `group.default_radius_meters = 60000` sẽ làm MỌI lượt tạo nhóm trả
 * 500 — và màn hình cấu hình không hề nói gì lúc bấm Lưu.
 *
 * `resolveGroupRadiusKm` vẫn kẹp một lần nữa ở tầng dưới. Hai lớp làm hai việc
 * khác nhau: tầng này để Admin BIẾT, tầng dưới để không bao giờ SẬP.
 */
export const SystemConfigValueRanges: Readonly<
  Record<string, { readonly min: number; readonly max: number }>
> = {
  'group.default_radius_meters': { min: 1_000, max: 50_000 },
  'group.min_radius_meters': { min: 1_000, max: 50_000 },
  'group.max_radius_meters': { min: 1_000, max: 50_000 },
  'group.radius_meters.member': { min: 1_000, max: 50_000 },
  'group.radius_meters.silver': { min: 1_000, max: 50_000 },
  'group.radius_meters.gold': { min: 1_000, max: 50_000 },
  'group.radius_meters.diamond': { min: 1_000, max: 50_000 },
};

export interface IPublishAdminConfigCommand {
  actorUserId: string;
  systemConfig: IPublishAdminConfigBodyDto;
}
export interface IPublishAdminConfigResult {
  config: ISystemConfigSummary;
}
export interface IPublishAdminConfigUseCase extends IUseCase<
  IPublishAdminConfigCommand,
  IPublishAdminConfigResult
> {}
export const IPublishAdminConfigUseCase = Symbol('IPublishAdminConfigUseCase');

export interface IGetAdminAuditLogsCommand {
  actorUserId: string;
  actorFilter?: string;
  action?: string;
  resourceType?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}
export interface IGetAdminAuditLogsResult {
  logs: IAdminAuditSummary[];
  meta: IPaginationMetaDto;
}
export interface IGetAdminAuditLogsUseCase extends IUseCase<
  IGetAdminAuditLogsCommand,
  IGetAdminAuditLogsResult
> {}
export const IGetAdminAuditLogsUseCase = Symbol('IGetAdminAuditLogsUseCase');
