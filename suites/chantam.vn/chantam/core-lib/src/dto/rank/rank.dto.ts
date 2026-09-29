import { UserRanks } from '../../consts';

export type RankMaintenanceCycleStatuses =
  'OPEN' | 'UNEVALUATED' | 'SATISFIED' | 'FAILED';

export interface IRankNextProgressDto {
  rank: UserRanks;
  requiredPoints: number;
  remainingPoints: number;
  requiredGifts: number;
  requiredReferrals: number;
  qualifiedReferrals: number;
}

export interface IRankMaintenanceCycleDto {
  rank: UserRanks;
  cycleStart: Date;
  cycleEnd: Date;
  giftsDone: number;
  referralsDone: number;
  status: RankMaintenanceCycleStatuses;
}

export interface IRankSummaryDto {
  rank: UserRanks;
  /**
   * Tổng điểm từng kiếm được. Chỉ là số thống kê để hiển thị.
   *
   * **KHÔNG phải căn cứ xét hạng** — xem `balancePoints`.
   */
  lifetimePoints: number;
  /** Điểm đang có — số tiêu được. */
  balancePoints: number;
  /**
   * Con số THẬT SỰ quyết định hạng.
   *
   * Bằng `balancePoints` với cấu hình mặc định (chốt 2026-09-24), và bằng
   * `lifetimePoints` khi Admin chuyển `rank.points_source` sang LIFETIME. Client
   * so với `thresholdPoints` / `warningPoints` thì phải đọc field NÀY — đọc
   * `balancePoints` là đúng hôm nay và sai ngay lần cấu hình đổi.
   */
  rankPoints: number;
  /** Cột đang cầm quyền quyết hạng, để client khỏi tự đoán. */
  rankPointsSource: 'BALANCE' | 'LIFETIME';
  /** Ngưỡng của bậc đang giữ. Rơi dưới mốc này là tụt hạng. */
  thresholdPoints: number;
  /**
   * Mốc cảnh báo của bậc đang giữ.
   *
   * `rankPoints` xuống dưới mốc này thì người dùng cần được nhắc trước khi họ
   * tiêu thêm và mất hạng mà không hiểu vì sao.
   */
  warningPoints: number;
  /** `true` khi `rankPoints` đã xuống dưới mốc cảnh báo. */
  demotionWarning: boolean;
  postQuota: number;
  nextRank: IRankNextProgressDto | null;
  maintenanceCycle: IRankMaintenanceCycleDto | null;
}

export interface IAdminRankTierPolicyDto {
  rank: UserRanks;
  thresholdPoints: number;
  warningPoints: number;
  requiredGifts: number;
  requiredReferrals: number;
  maintenanceGifts: number;
  maintenanceReferrals: number;
  maintenancePenaltyPoints: number;
  version: number;
}

export interface IAdminRankTierPolicyInputDto {
  rank: UserRanks;
  thresholdPoints: number;
  warningPoints: number;
  requiredGifts: number;
  requiredReferrals: number;
}

export interface IPublishAdminRankPolicyDto {
  changeReason: string;
  tiers: IAdminRankTierPolicyInputDto[];
}

export interface IPublishAdminRankPolicyBodyDto {
  rankPolicy: IPublishAdminRankPolicyDto;
}

export interface IGetAdminRankPolicyResponseDto {
  rankPolicy: IAdminRankTierPolicyDto[];
}

export interface IPublishAdminRankPolicyResponseDto extends IGetAdminRankPolicyResponseDto {}

export interface IAdminMaintenanceTierInputDto {
  rank: UserRanks;
  maintenanceGifts: number;
  maintenanceReferrals: number;
  /** Điểm bị trừ khi trượt chu kỳ. `0` với bậc không có chu kỳ duy trì. */
  maintenancePenaltyPoints: number;
}

export interface IPublishAdminMaintenancePolicyDto {
  changeReason: string;
  tiers: IAdminMaintenanceTierInputDto[];
}

export interface IPublishAdminMaintenancePolicyBodyDto {
  maintenancePolicy: IPublishAdminMaintenancePolicyDto;
}

export interface IPublishAdminMaintenancePolicyResponseDto extends IGetAdminRankPolicyResponseDto {}

export interface IGetOwnRankSummaryResponseDto {
  rank: IRankSummaryDto;
}
