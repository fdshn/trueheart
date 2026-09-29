import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';

export type RankMaintenanceCycleStatuses =
  'OPEN' | 'UNEVALUATED' | 'SATISFIED' | 'FAILED';

export interface IRankTierSummary {
  readonly rank: UserRanks;
  readonly thresholdPoints: number;
  /** Mốc cảnh báo sắp tụt hạng. */
  readonly warningPoints: number;
  readonly requiredGifts: number;
  readonly requiredReferrals: number;
  readonly postQuota: number;
}

export interface IRankMaintenanceCycleSummary {
  readonly rank: UserRanks;
  readonly cycleStart: Date;
  readonly cycleEnd: Date;
  readonly giftsDone: number;
  readonly referralsDone: number;
  readonly status: RankMaintenanceCycleStatuses;
}

export interface IMaintenanceReminder {
  readonly cycleId: string;
  readonly userId: string;
  readonly rank: string;
  readonly daysLeft: number;
  readonly giftsDone: number;
  readonly requiredGifts: number;
  readonly referralsDone: number;
  readonly requiredReferrals: number;
  readonly penaltyPoints: number;
}

export interface IRankChange {
  readonly fromRank: UserRanks;
  readonly toRank: UserRanks;
  /** `true` khi bậc mới thấp hơn bậc cũ. */
  readonly demoted: boolean;
}

export interface IRankSummary {
  readonly rank: UserRanks;
  /**
   * Con số THẬT SỰ quyết định hạng, theo cấu hình `rank.points_source`.
   *
   * Bằng `balancePoints` với cấu hình mặc định, và bằng `lifetimePoints` khi Admin
   * chuyển nguồn sang LIFETIME. Có field riêng vì mọi phép so với ngưỡng phải đọc
   * ĐÚNG con số mà chỗ quyết hạng đọc: trước đây lời cảnh báo sắp tụt hạng so
   * `balancePoints` với ngưỡng trong khi quyết định tụt hạng lại so cột đã cấu
   * hình, nên đổi cấu hình một lần là hai bên nói về hai con số khác nhau.
   */
  readonly rankPoints: number;
  /** Cột đang được dùng để quyết hạng — để client khỏi đoán. */
  readonly rankPointsSource: 'BALANCE' | 'LIFETIME';
  /** Tổng điểm từng kiếm được. Số thống kê, KHÔNG phải căn cứ xét hạng. */
  readonly lifetimePoints: number;
  /** Điểm đang có — con số QUYẾT ĐỊNH hạng (chốt 2026-09-24). */
  readonly balancePoints: number;
  readonly currentTier: IRankTierSummary;
  readonly nextTier: IRankTierSummary | null;
  readonly qualifiedReferrals: number;
  readonly maintenanceCycle: IRankMaintenanceCycleSummary | null;
}

export interface IRankRepository {
  getOwnSummary(userId: string): Promise<IRankSummary>;
  promoteMemberOnboarding(userId: string): Promise<boolean>;
  /**
   * Xét lại hạng theo balance hiện tại, gọi sau MỌI biến động điểm.
   *
   * Trả `null` khi hạng không đổi, hoặc mô tả lần đổi khi có đổi. Trả về thay vì
   * chỉ `true/false` vì chỗ gọi cần biết ĐỔI TỪ ĐÂU SANG ĐÂU để báo cho người
   * dùng — "hạng của bạn đã thay đổi" không phải một thông báo dùng được.
   */
  reconcileNormalRank(userId: string): Promise<IRankChange | null>;
  /**
   * Chu kỳ đã đánh FAILED mà chưa bị trừ điểm.
   *
   * Đánh giá chu kỳ và áp khoản trừ là hai bước riêng: bước đầu nằm trong một
   * transaction quét hàng loạt, bước sau đi qua sổ điểm với khoá chống trùng
   * riêng. Tiến trình chết giữa hai bước là mất khoản trừ vĩnh viễn — chu kỳ đã
   * FAILED nên vòng quét sau không nhìn tới nó nữa. Đây là đầu vào để vá.
   *
   * Cùng khuôn với `findPhoneVerifiedUsersMissingReward`.
   */
  findUnpenalizedFailedCycles(limit: number): Promise<
    {
      cycleId: string;
      userId: string;
      rank: string;
      penaltyPoints: number;
    }[]
  >;

  /**
   * Chu kỳ duy trì sắp hết hạn mà chưa nhắc.
   *
   * Trượt chu kỳ nay bị TRỪ ĐIỂM và có thể tụt hạng, nên nhắc muộn hơn thời
   * điểm còn kịp làm nhiệm vụ là nhắc một việc không còn cứu được.
   */
  findCyclesNeedingReminder(params: {
    remindBeforeDays: number;
    limit: number;
  }): Promise<IMaintenanceReminder[]>;

  /** Đánh dấu đã nhắc, để vòng quét sau bỏ qua ngay ở tầng SQL. */
  markCyclesReminded(cycleIds: string[]): Promise<void>;

  evaluateDueMaintenanceCycles(): Promise<number>;
}

export const IRankRepository = Symbol('IRankRepository');
