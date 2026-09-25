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

export interface IRankChange {
  readonly fromRank: UserRanks;
  readonly toRank: UserRanks;
  /** `true` khi bậc mới thấp hơn bậc cũ. */
  readonly demoted: boolean;
}

export interface IRankSummary {
  readonly rank: UserRanks;
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

  evaluateDueMaintenanceCycles(): Promise<number>;
}

export const IRankRepository = Symbol('IRankRepository');
