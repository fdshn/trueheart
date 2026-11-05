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
  // `accuracy.giver` KHÔNG nằm ở đây dù trước kia có: nó là JSON, còn đường này chỉ
  // nhận INTEGER — ghi một số trần đè lên là chỉ số rơi về mặc định mà không ai
  // biết. Đổi qua `PUT /admin/config/trust-thresholds/giver-accuracy` (CMS A13).
  // Ngưỡng diện xem xét cho dấu vết đăng ký trùng (23 §23.7).
  //
  // Phải có ở đây, không chỉ ở `system_configs`: cả thiết kế dựa trên việc Bên A BẬT
  // nó khi đã có dữ liệu, và một khoá seed sẵn mà không nằm trong danh sách này thì
  // chỉ đổi được bằng SQL tay — đúng thứ "cấu hình động" sinh ra để tránh.
  'referral.review_min_qualified',
  'referral.review_min_device_clusters',
  'referral.review_min_cluster_size',
  // Trần giá trị dùng để tính `value_bonus` (CHỐT-14), đơn vị VNĐ.
  //
  // Phải có ở đây vì nó là van an toàn duy nhất của một lỗ in điểm: CHỐT-14 đưa giá
  // người tặng TỰ KHAI vào công thức, và không trần thì một lượt trao khai
  // 1.000.000.000đ cho ra 500.000 điểm — 279 lần ngưỡng Kim Cương. Một van an toàn chỉ
  // sửa được bằng SQL tay thì không ai dám xoay nó khi cần.
  'point.value_bonus_max_value_vnd',
  // Bảng thành tích tháng (24/10). Cả sáu đều INTEGER — `leaderboard.enabled` là 0/1.
  'leaderboard.enabled',
  'leaderboard.min_givers',
  'leaderboard.min_charity',
  'leaderboard.min_consistency_days',
  'leaderboard.badge_ranks',
  'leaderboard.badge_months',
  // Rao vặt (PR #46 §8): 1 = bật lại xin nhận/lượt trao cũ cho bài CLASSIFIED.
  'classified.legacy_transactions_enabled',
  // Chat trực tiếp với người dùng (30/10): số phòng MỚI một người mở được trong 24 giờ.
  'chat.direct_user_daily_limit',
  // Dự án từ thiện 4 giai đoạn: số tài khoản nhận tiền đang hiệu lực tối đa mỗi dự án
  // (Admin ghi đè từng dự án qua PATCH /admin/charity-campaigns/:id/limits).
  'charity.max_bank_accounts_per_campaign',
  'charity.post_daily_video_quota',
  'charity.post_daily_image_quota',
  'charity.points_cap.charity_item_value.daily',
  'charity.points_cap.charity_item_value.project',
  'charity.points_cap.charity_item_value.cycle',
  'charity.points_cap.charity_post_video.daily',
  'charity.points_cap.charity_post_video.project',
  'charity.points_cap.charity_post_video.cycle',
  'charity.points_cap.charity_post_image.daily',
  'charity.points_cap.charity_post_image.project',
  'charity.points_cap.charity_post_image.cycle',
  'charity.points_cap.charity_participation.daily',
  'charity.points_cap.charity_participation.project',
  'charity.points_cap.charity_participation.cycle',
  'charity.appeal_window_days',
  'charity.appeal_organizer_sla_days',
  'charity.appeal_auto_close_days',
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
  // `0` hợp lệ và có nghĩa: TẮT hẳn thưởng theo giá trị.
  //
  // Cận trên là `MaxClassifiedPrice` — mức giá cao nhất người tặng khai được. Đặt trần
  // cao hơn con số đó thì cái núm này không còn tác dụng gì, nên đây là cận CỨNG của
  // tầng dưới chứ không phải một khoảng tôi bịa ra thay Bên A.
  'point.value_bonus_max_value_vnd': { min: 0, max: 1_000_000_000 },
  // Bảng thành tích: cận dưới là sàn mà `readLeaderboardConfig` dưới đó LẶNG LẼ dùng mặc
  // định — lưu được mà không có tác dụng là đúng kiểu hỏng phép kiểm này sinh ra để chặn.
  // Cận trên là cận cứng: công tắc 0/1, tháng có tối đa 31 ngày, và cột `int` của bảng.
  'leaderboard.enabled': { min: 0, max: 1 },
  'leaderboard.min_givers': { min: 1, max: 2_147_483_647 },
  'leaderboard.min_charity': { min: 1, max: 2_147_483_647 },
  'leaderboard.min_consistency_days': { min: 1, max: 31 },
  'leaderboard.badge_ranks': { min: 0, max: 2_147_483_647 },
  'leaderboard.badge_months': { min: 1, max: 2_147_483_647 },
  // `0` thì không ai mở được phòng trực tiếp mới — công tắc tắt khẩn khi bị spam.
  'chat.direct_user_daily_limit': { min: 0, max: 10_000 },
  // Cột ghi đè `campaigns.max_bank_accounts` có CHECK 1..20 — cùng khoảng.
  'charity.max_bank_accounts_per_campaign': { min: 1, max: 20 },
  // 0 = tắt đăng loại media đó; khớp `normalizeCharityPostQuota`.
  'charity.post_daily_video_quota': { min: 0, max: 100 },
  'charity.post_daily_image_quota': { min: 0, max: 100 },
  // Trần điểm dự án từ thiện (0 = không trần) — chạm trần thì HOÃN, không bỏ.
  'charity.points_cap.charity_item_value.daily': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_item_value.project': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_item_value.cycle': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_post_video.daily': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_post_video.project': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_post_video.cycle': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_post_image.daily': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_post_image.project': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_post_image.cycle': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_participation.daily': { min: 0, max: 1_000_000 },
  'charity.points_cap.charity_participation.project': {
    min: 0,
    max: 1_000_000,
  },
  'charity.points_cap.charity_participation.cycle': { min: 0, max: 1_000_000 },
  'charity.appeal_window_days': { min: 1, max: 90 },
  'charity.appeal_organizer_sla_days': { min: 1, max: 30 },
  'charity.appeal_auto_close_days': { min: 1, max: 30 },
  'classified.legacy_transactions_enabled': { min: 0, max: 1 },
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
