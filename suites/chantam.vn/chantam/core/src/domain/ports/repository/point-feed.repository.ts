import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';

/** Một bút toán gốc lên bảng tin điểm, thưởng hệ số đã gộp (CR 22/11/2026). */
export interface IPointFeedRow {
  entryId: number;
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: UserRanks;
  /** Chỉ để dựng `ruleTitle` — không bao giờ trả ra ngoài. */
  ruleCode: string;
  delta: number;
  /** Tổng bút toán thưởng trỏ về bút toán này. */
  bonusDelta: number;
  /** Hệ số của chiến dịch ngữ cảnh khi có thưởng; `null` khi không. */
  bonusPercent: number | null;
  occurredAt: Date;
  context: {
    type: 'CHARITY_CAMPAIGN' | 'POST';
    id: string;
    title: string;
  } | null;
}

export interface IPointFeedRepository {
  /**
   * Bút toán DƯƠNG của rule hiện, người dùng còn hoạt động, chưa khoá, bật cờ bảng tin (trừ khi
   * hỏi theo `userId`). Không `afterId`: mới nhất trước; có `afterId`: tăng dần sau mốc đó.
   */
  list(params: {
    afterId: number | null;
    /** Chỉ lấy dòng có id ≤ mốc này (mốc đọc trước); `null` = không chặn trên. */
    upToId: number | null;
    limit: number;
    userId: string | null;
    minDelta: number;
    excludedRuleCodes: readonly string[];
    mergedRuleCodes: readonly string[];
  }): Promise<IPointFeedRow[]>;
  /** Id bút toán lớn nhất (của một người khi có `userId`). */
  latestId(userId: string | null): Promise<number | null>;
  /** ACTIVE, chưa khoá, chưa xoá, bật cờ bảng tin. */
  isFeedVisible(userId: string): Promise<boolean>;
}

export const IPointFeedRepository = Symbol('IPointFeedRepository');
