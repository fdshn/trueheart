import {
  LeaderboardBoards,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';

/**
 * Một dòng trên bảng thành tích — trực tiếp hoặc đã chốt.
 *
 * `userId` LUÔN có, kể cả với dòng ẩn danh: tầng use case cần nó để tìm "dòng của tôi" và
 * để trao huy hiệu. Mapper công khai bỏ nó đi — danh tính chỉ đi qua `identity`, và
 * `identity` là `null` ngay từ câu SQL khi dòng không được lộ.
 */
export interface ILeaderboardRow {
  readonly rank: number;
  readonly count: number;
  readonly reachedAt: Date;
  readonly userId: string;
  readonly isAnonymous: boolean;
  /** Chỉ ở bản chốt: tài khoản bị khoá/xoá SAU khi chốt. */
  readonly isInactive: boolean;
  /** `null` khi ẩn danh hoặc `isInactive` — trừ khi gọi với `revealIdentity`. */
  readonly identity: ILeaderboardIdentity | null;
  /** Chỉ có ở biến thể Admin (`includeExcluded`). */
  readonly excluded?: boolean;
}

export interface ILeaderboardIdentity {
  readonly username: string;
  readonly fullName: string | null;
  readonly avatarUrl: string | null;
  readonly rank: UserRanks;
}

export interface ILeaderboardSnapshot {
  readonly id: string;
  readonly closedAt: Date;
  readonly badgesAwarded: boolean;
}

export interface IUserBadge {
  readonly badgeId: string;
  readonly userId: string;
  readonly board: LeaderboardBoards;
  /** `'YYYY-MM-01'` */
  readonly month: string;
  readonly rank: number;
  readonly isAnonymous: boolean;
  readonly awardedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revokeReason: string | null;
}

export interface ILeaderboardExclusion {
  readonly exclusionId: string;
  /** `'YYYY-MM-01'` */
  readonly month: string;
  /** `null` = mọi bảng. */
  readonly board: LeaderboardBoards | null;
  readonly userId: string;
  readonly reason: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly removedAt: Date | null;
  readonly removedBy: string | null;
}

export type LeaderboardBadgeScope = 'PUBLIC_ACTIVE' | 'OWN_ACTIVE' | 'ALL';

export interface ILeaderboardRepository {
  /**
   * Bảng của một tháng tính từ bảng nghiệp vụ. Mọi người đủ điều kiện, đã xếp hạng.
   * `month` là `'YYYY-MM-01'`.
   */
  computeLive(params: {
    month: string;
    board: LeaderboardBoards;
    minCount: number;
    includeExcluded?: boolean;
    revealIdentity?: boolean;
  }): Promise<ILeaderboardRow[]>;

  findSnapshot(
    month: string,
    board: LeaderboardBoards,
  ): Promise<ILeaderboardSnapshot | null>;

  listSnapshotEntries(params: {
    snapshotId: string;
    skip: number;
    take: number;
    revealIdentity?: boolean;
  }): Promise<{ items: ILeaderboardRow[]; total: number }>;

  /** Dòng của một người trong bản chốt — danh tính của CHÍNH họ luôn có. */
  findSnapshotEntry(
    snapshotId: string,
    userId: string,
  ): Promise<ILeaderboardRow | null>;

  /** Tháng đã chốt (ít nhất một bảng), `'YYYY-MM-01'`, mới nhất trước. */
  listClosedMonths(): Promise<string[]>;

  /**
   * Ghi bản chốt và (nếu có) huy hiệu trong MỘT transaction. Đã có bản chốt cho
   * (tháng, bảng) thì không ghi gì và trả `created: false`.
   */
  closeBoard(params: {
    month: string;
    board: LeaderboardBoards;
    rows: readonly ILeaderboardRow[];
    awardBadges: { ranks: number; expiresAt: Date } | null;
  }): Promise<{
    created: boolean;
    badges: { userId: string; rank: number }[];
  }>;

  listBadges(params: {
    userId: string;
    scope: LeaderboardBadgeScope;
    now: Date;
  }): Promise<IUserBadge[]>;

  listBadgesForAdmin(params: {
    month?: string;
    board?: LeaderboardBoards;
    userId?: string;
    skip: number;
    take: number;
  }): Promise<{ items: IUserBadge[]; total: number }>;

  /** `null` khi không có hoặc đã gỡ. */
  revokeBadge(params: {
    badgeId: string;
    actorUserId: string;
    reason: string;
  }): Promise<IUserBadge | null>;

  /** Ném lỗi ràng buộc `UQ_leaderboard_exclusions_active` khi đã có lượt loại đang hiệu lực. */
  createExclusion(params: {
    month: string;
    board: LeaderboardBoards | null;
    userId: string;
    reason: string;
    actorUserId: string;
  }): Promise<ILeaderboardExclusion>;

  /** `null` khi không có hoặc đã bỏ. */
  removeExclusion(params: {
    exclusionId: string;
    actorUserId: string;
  }): Promise<ILeaderboardExclusion | null>;

  listExclusions(params: {
    month?: string;
    board?: LeaderboardBoards;
    skip: number;
    take: number;
  }): Promise<{ items: ILeaderboardExclusion[]; total: number }>;

  setAnonymous(userId: string, value: boolean): Promise<void>;

  isAnonymous(userId: string): Promise<boolean>;
}

export const ILeaderboardRepository = Symbol('ILeaderboardRepository');
