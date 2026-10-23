import {
  ILeaderboardExclusion,
  ILeaderboardIdentity,
  ILeaderboardRepository,
  ILeaderboardRow,
  ILeaderboardSnapshot,
  IUserBadge,
  LeaderboardBadgeScope,
} from '@/domain/ports/repository';
import {
  LeaderboardBoards,
  monthBoundsUtc,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

/**
 * Nguồn đếm của từng bảng. Mỗi câu trả `(user_id, count, reached_at)` cho tháng `[$5, $6)`.
 *
 * `reached_at` là mốc của lần đếm CUỐI — tức lần thứ N, với N là con số của người đó. Phá
 * hoà "ai đạt con số đó sớm hơn" chỉ cần so cột này.
 *
 * Đếm từ bảng NGHIỆP VỤ, không từ `point_ledger`: luật `CHARITY_CONTRIBUTION_COMPLETED`
 * đang TẮT nên sổ điểm ra 0, và điểm thì phụ thuộc thang Admin chỉnh.
 */
const CountSources: Record<LeaderboardBoards, string> = {
  // Người tặng ở cả bài Muốn Tặng lẫn Muốn Nhận đều ghi ở `giver_id`.
  [LeaderboardBoards.GIVERS]: `
    SELECT deal.giver_id AS user_id, COUNT(*)::int AS count, MAX(deal.completed_at) AS reached_at
    FROM gift_transactions deal
    WHERE deal.status = 'COMPLETED'
      AND deal.completed_at >= $5 AND deal.completed_at < $6
    GROUP BY deal.giver_id`,
  // Đúng điều kiện của luật điểm từ thiện: một lần mỗi đề nghị, và chỉ khi thực nhận được
  // ít nhất một thứ. `received_quantity = 0` là "đã xác nhận, không nhận được gì".
  [LeaderboardBoards.CHARITY]: `
    SELECT delivery.contributor_id AS user_id, COUNT(*)::int AS count,
           MAX(delivery.completed_at) AS reached_at
    FROM campaign_deliveries delivery
    WHERE delivery.status = 'COMPLETED'
      AND delivery.completed_at >= $5 AND delivery.completed_at < $6
      AND EXISTS (
        SELECT 1 FROM campaign_delivery_items item
        WHERE item.delivery_id = delivery.global_id AND item.received_quantity > 0
      )
    GROUP BY delivery.contributor_id`,
  // `policy_date` đã là ngày Việt Nam (kiểu `date`). Ngày bù (`REPAIR`) không tính: nó giữ
  // chuỗi cho một ngày đã lỡ, tính vào bảng thì người hay lỡ rồi bù ngang người vào đều.
  [LeaderboardBoards.CONSISTENCY]: `
    SELECT entry.user_id, COUNT(*)::int AS count, MAX(entry.created_at) AS reached_at
    FROM check_in_entries entry
    WHERE entry.kind = 'NORMAL'
      AND entry.policy_date >= ($5::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND entry.policy_date < ($6::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    GROUP BY entry.user_id`,
};

interface IRowRecord {
  rank: string | number;
  count: number;
  reached_at: Date;
  user_id: string;
  is_anonymous: boolean;
  is_inactive: boolean;
  excluded?: boolean;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  user_rank: UserRanks | null;
}

interface IBadgeRecord {
  global_id: string;
  user_id: string;
  board: LeaderboardBoards;
  month: string;
  rank: number;
  is_anonymous: boolean;
  awarded_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
}

interface IExclusionRecord {
  global_id: string;
  month: string;
  board: LeaderboardBoards | null;
  user_id: string;
  reason: string;
  created_by: string;
  created_at: Date;
  removed_at: Date | null;
  removed_by: string | null;
}

/**
 * Danh tính đi ra từ SQL dưới dạng `CASE ... THEN NULL`, không phải lọc ở mapper — tên thật
 * của người ẩn danh không bao giờ rời database trên đường công khai (mẫu của hồi hướng).
 * `$hidden` là biểu thức SQL boolean: đúng thì che.
 */
const identityColumns = (hidden: string) => `
  CASE WHEN ${hidden} THEN NULL ELSE u.username END AS username,
  CASE WHEN ${hidden} THEN NULL ELSE u.full_name END AS full_name,
  CASE WHEN ${hidden} THEN NULL ELSE u.avatar_url END AS avatar_url,
  CASE WHEN ${hidden} THEN NULL ELSE u.rank::text END AS user_rank`;

const BadgeColumns = `
  badge.global_id, badge.user_id, badge.board, to_char(badge.month, 'YYYY-MM-DD') AS month,
  badge.rank, badge.is_anonymous, badge.awarded_at, badge.expires_at, badge.revoked_at,
  badge.revoke_reason`;

const ExclusionColumns = `
  exclusion.global_id, to_char(exclusion.month, 'YYYY-MM-DD') AS month, exclusion.board,
  exclusion.user_id, exclusion.reason, exclusion.created_by, exclusion.created_at,
  exclusion.removed_at, exclusion.removed_by`;

@Injectable()
export class LeaderboardRepository implements ILeaderboardRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async computeLive(params: {
    month: string;
    board: LeaderboardBoards;
    minCount: number;
    includeExcluded?: boolean;
    revealIdentity?: boolean;
  }): Promise<ILeaderboardRow[]> {
    const { start, end } = monthBoundsUtc(params.month);
    const rows = await this.manager.query<IRowRecord[]>(
      `
        WITH counted AS (${CountSources[params.board]}),
        eligible AS (
          SELECT counted.*, u.leaderboard_anonymous AS is_anonymous,
                 EXISTS (
                   SELECT 1 FROM leaderboard_exclusions exclusion
                   WHERE exclusion.user_id = counted.user_id
                     AND exclusion.month = $1::date
                     AND (exclusion.board IS NULL OR exclusion.board = $2::text)
                     AND exclusion.removed_at IS NULL
                 ) AS excluded
          FROM counted
          JOIN users u ON u.global_id = counted.user_id
          WHERE u.status = 'ACTIVE' AND counted.count >= $3
        )
        SELECT ROW_NUMBER() OVER (
                 ORDER BY eligible.count DESC, eligible.reached_at ASC, eligible.user_id ASC
               ) AS rank,
               eligible.count, eligible.reached_at, eligible.user_id, eligible.is_anonymous,
               false AS is_inactive, eligible.excluded,
               ${identityColumns('eligible.is_anonymous AND NOT $7::boolean')}
        FROM eligible
        JOIN users u ON u.global_id = eligible.user_id
        WHERE $4::boolean OR NOT eligible.excluded
        ORDER BY rank
      `,
      [
        params.month,
        params.board,
        params.minCount,
        params.includeExcluded ?? false,
        start,
        end,
        params.revealIdentity ?? false,
      ],
    );
    return rows.map((row) => toRow(row, params.includeExcluded ?? false));
  }

  public async findSnapshot(
    month: string,
    board: LeaderboardBoards,
  ): Promise<ILeaderboardSnapshot | null> {
    const [row] = await this.manager.query<
      { id: string; closed_at: Date; badges_awarded: boolean }[]
    >(
      `SELECT id::text AS id, closed_at, badges_awarded
       FROM leaderboard_snapshots WHERE month = $1::date AND board = $2`,
      [month, board],
    );
    return row
      ? {
          id: row.id,
          closedAt: row.closed_at,
          badgesAwarded: row.badges_awarded,
        }
      : null;
  }

  public async listSnapshotEntries(params: {
    snapshotId: string;
    skip: number;
    take: number;
    revealIdentity?: boolean;
  }): Promise<{ items: ILeaderboardRow[]; total: number }> {
    const rows = await this.manager.query<IRowRecord[]>(
      `
        SELECT entry.rank, entry.count, entry.reached_at, entry.user_id, entry.is_anonymous,
               u.status <> 'ACTIVE' AS is_inactive,
               ${identityColumns(
                 "(entry.is_anonymous OR u.status <> 'ACTIVE') AND NOT $4::boolean",
               )}
        FROM leaderboard_entries entry
        JOIN users u ON u.global_id = entry.user_id
        WHERE entry.snapshot_id = $1::bigint
        ORDER BY entry.rank
        OFFSET $2 LIMIT $3
      `,
      [
        params.snapshotId,
        params.skip,
        params.take,
        params.revealIdentity ?? false,
      ],
    );
    const [{ total }] = await this.manager.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM leaderboard_entries WHERE snapshot_id = $1::bigint`,
      [params.snapshotId],
    );
    return { items: rows.map((row) => toRow(row, false)), total };
  }

  public async findSnapshotEntry(
    snapshotId: string,
    userId: string,
  ): Promise<ILeaderboardRow | null> {
    const [row] = await this.manager.query<IRowRecord[]>(
      `
        SELECT entry.rank, entry.count, entry.reached_at, entry.user_id, entry.is_anonymous,
               u.status <> 'ACTIVE' AS is_inactive, ${identityColumns('false')}
        FROM leaderboard_entries entry
        JOIN users u ON u.global_id = entry.user_id
        WHERE entry.snapshot_id = $1::bigint AND entry.user_id = $2
      `,
      [snapshotId, userId],
    );
    return row ? toRow(row, false) : null;
  }

  public async listClosedMonths(): Promise<string[]> {
    const rows = await this.manager.query<{ month: string }[]>(
      `SELECT DISTINCT to_char(month, 'YYYY-MM-DD') AS month
       FROM leaderboard_snapshots ORDER BY month DESC`,
    );
    return rows.map((row) => row.month);
  }

  public async closeBoard(params: {
    month: string;
    board: LeaderboardBoards;
    rows: readonly ILeaderboardRow[];
    awardBadges: { ranks: number; expiresAt: Date } | null;
  }): Promise<{
    created: boolean;
    badges: { userId: string; rank: number }[];
  }> {
    return this.manager.transaction(async (manager) => {
      // `UNIQUE (month, board)` — chốt lần hai, hay hai tiến trình chốt song song, rơi vào
      // đây và không ghi gì. Không phải một `SELECT` rồi `INSERT` có khe hở ở giữa.
      const [snapshot] = await manager.query<{ id: string }[]>(
        `INSERT INTO leaderboard_snapshots (month, board)
         VALUES ($1::date, $2)
         ON CONFLICT (month, board) DO NOTHING
         RETURNING id::text AS id`,
        [params.month, params.board],
      );
      if (!snapshot) return { created: false, badges: [] };

      await manager.query(
        `INSERT INTO leaderboard_entries
           (snapshot_id, user_id, rank, count, reached_at, is_anonymous)
         SELECT $1::bigint, entry.user_id, entry.rank, entry.count, entry.reached_at,
                entry.is_anonymous
         FROM unnest($2::uuid[], $3::int[], $4::int[], $5::timestamptz[], $6::boolean[])
           AS entry(user_id, rank, count, reached_at, is_anonymous)`,
        [
          snapshot.id,
          params.rows.map((row) => row.userId),
          params.rows.map((row) => row.rank),
          params.rows.map((row) => row.count),
          params.rows.map((row) => row.reachedAt),
          params.rows.map((row) => row.isAnonymous),
        ],
      );

      if (!params.awardBadges) return { created: true, badges: [] };

      // Cờ ẩn danh của huy hiệu là cờ LÚC CHỐT, chép từ dòng bản chốt.
      const badges = await manager.query<{ user_id: string; rank: number }[]>(
        `INSERT INTO user_badges (user_id, board, month, rank, is_anonymous, expires_at)
         SELECT entry.user_id, $2, $3::date, entry.rank, entry.is_anonymous, $4
         FROM leaderboard_entries entry
         WHERE entry.snapshot_id = $1::bigint AND entry.rank <= $5
         ORDER BY entry.rank
         ON CONFLICT (user_id, board, month) DO NOTHING
         RETURNING user_id, rank`,
        [
          snapshot.id,
          params.board,
          params.month,
          params.awardBadges.expiresAt,
          params.awardBadges.ranks,
        ],
      );
      await manager.query(
        `UPDATE leaderboard_snapshots SET badges_awarded = true WHERE id = $1::bigint`,
        [snapshot.id],
      );
      return {
        created: true,
        badges: badges
          .map((badge) => ({ userId: badge.user_id, rank: badge.rank }))
          .sort((left, right) => left.rank - right.rank),
      };
    });
  }

  public async listBadges(params: {
    userId: string;
    scope: LeaderboardBadgeScope;
    now: Date;
  }): Promise<IUserBadge[]> {
    const filter =
      params.scope === 'ALL'
        ? ''
        : `AND badge.revoked_at IS NULL AND badge.expires_at > $2
           ${params.scope === 'PUBLIC_ACTIVE' ? 'AND NOT badge.is_anonymous' : ''}`;
    const rows = await this.manager.query<IBadgeRecord[]>(
      `SELECT ${BadgeColumns}
       FROM user_badges badge
       WHERE badge.user_id = $1 ${filter}
       ORDER BY badge.month DESC, badge.rank ASC, badge.board ASC`,
      params.scope === 'ALL' ? [params.userId] : [params.userId, params.now],
    );
    return rows.map(toBadge);
  }

  public async listBadgesForAdmin(params: {
    month?: string;
    board?: LeaderboardBoards;
    userId?: string;
    skip: number;
    take: number;
  }): Promise<{ items: IUserBadge[]; total: number }> {
    const where = `
      WHERE ($1::date IS NULL OR badge.month = $1::date)
        AND ($2::text IS NULL OR badge.board = $2::text)
        AND ($3::uuid IS NULL OR badge.user_id = $3::uuid)`;
    const filters = [
      params.month ?? null,
      params.board ?? null,
      params.userId ?? null,
    ];
    const rows = await this.manager.query<IBadgeRecord[]>(
      `SELECT ${BadgeColumns} FROM user_badges badge ${where}
       ORDER BY badge.month DESC, badge.board ASC, badge.rank ASC
       OFFSET $4 LIMIT $5`,
      [...filters, params.skip, params.take],
    );
    const [{ total }] = await this.manager.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM user_badges badge ${where}`,
      filters,
    );
    return { items: rows.map(toBadge), total };
  }

  public async revokeBadge(params: {
    badgeId: string;
    actorUserId: string;
    reason: string;
  }): Promise<IUserBadge | null> {
    const [row] = await updateReturning<IBadgeRecord>(
      this.manager,
      `UPDATE user_badges badge
          SET revoked_at = now(), revoked_by = $2, revoke_reason = $3
        WHERE badge.global_id = $1 AND badge.revoked_at IS NULL
        RETURNING ${BadgeColumns}`,
      [params.badgeId, params.actorUserId, params.reason],
    );
    return row ? toBadge(row) : null;
  }

  public async createExclusion(params: {
    month: string;
    board: LeaderboardBoards | null;
    userId: string;
    reason: string;
    actorUserId: string;
  }): Promise<ILeaderboardExclusion> {
    const [row] = await this.manager.query<IExclusionRecord[]>(
      `INSERT INTO leaderboard_exclusions AS exclusion
         (month, board, user_id, reason, created_by)
       VALUES ($1::date, $2, $3, $4, $5)
       RETURNING ${ExclusionColumns}`,
      [
        params.month,
        params.board,
        params.userId,
        params.reason,
        params.actorUserId,
      ],
    );
    return toExclusion(row);
  }

  public async removeExclusion(params: {
    exclusionId: string;
    actorUserId: string;
  }): Promise<ILeaderboardExclusion | null> {
    const [row] = await updateReturning<IExclusionRecord>(
      this.manager,
      `UPDATE leaderboard_exclusions exclusion
          SET removed_at = now(), removed_by = $2
        WHERE exclusion.global_id = $1 AND exclusion.removed_at IS NULL
        RETURNING ${ExclusionColumns}`,
      [params.exclusionId, params.actorUserId],
    );
    return row ? toExclusion(row) : null;
  }

  public async listExclusions(params: {
    month?: string;
    board?: LeaderboardBoards;
    skip: number;
    take: number;
  }): Promise<{ items: ILeaderboardExclusion[]; total: number }> {
    const where = `
      WHERE ($1::date IS NULL OR exclusion.month = $1::date)
        AND ($2::text IS NULL OR exclusion.board IS NULL OR exclusion.board = $2::text)`;
    const filters = [params.month ?? null, params.board ?? null];
    const rows = await this.manager.query<IExclusionRecord[]>(
      `SELECT ${ExclusionColumns} FROM leaderboard_exclusions exclusion ${where}
       ORDER BY exclusion.created_at DESC, exclusion.id DESC
       OFFSET $3 LIMIT $4`,
      [...filters, params.skip, params.take],
    );
    const [{ total }] = await this.manager.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM leaderboard_exclusions exclusion ${where}`,
      filters,
    );
    return { items: rows.map(toExclusion), total };
  }

  public async findLiveIdentities(
    userIds: readonly string[],
  ): Promise<
    Map<string, { isAnonymous: boolean; identity: ILeaderboardIdentity | null }>
  > {
    if (userIds.length === 0) return new Map();
    const rows = await this.manager.query<(IRowRecord & { user_id: string })[]>(
      `SELECT u.global_id AS user_id, u.leaderboard_anonymous AS is_anonymous,
              ${identityColumns("u.leaderboard_anonymous OR u.status <> 'ACTIVE'")}
       FROM users u WHERE u.global_id = ANY($1::uuid[])`,
      [userIds],
    );
    return new Map(
      rows.map((row) => [
        row.user_id,
        {
          isAnonymous: row.is_anonymous,
          identity: toRow({ ...row, rank: 0, count: 0 } as never, false)
            .identity,
        },
      ]),
    );
  }

  public async setAnonymous(userId: string, value: boolean): Promise<void> {
    await this.manager.query(
      `UPDATE users SET leaderboard_anonymous = $2 WHERE global_id = $1`,
      [userId, value],
    );
  }

  public async isAnonymous(userId: string): Promise<boolean> {
    const [row] = await this.manager.query<{ anonymous: boolean }[]>(
      `SELECT leaderboard_anonymous AS anonymous FROM users WHERE global_id = $1`,
      [userId],
    );
    return row?.anonymous ?? false;
  }
}

function toRow(row: IRowRecord, withExcluded: boolean): ILeaderboardRow {
  return {
    rank: Number(row.rank),
    count: Number(row.count),
    reachedAt: row.reached_at,
    userId: row.user_id,
    isAnonymous: row.is_anonymous,
    isInactive: row.is_inactive,
    identity:
      row.username === null
        ? null
        : {
            username: row.username,
            fullName: row.full_name,
            avatarUrl: row.avatar_url,
            rank: row.user_rank as UserRanks,
          },
    ...(withExcluded ? { excluded: Boolean(row.excluded) } : {}),
  };
}

function toBadge(row: IBadgeRecord): IUserBadge {
  return {
    badgeId: row.global_id,
    userId: row.user_id,
    board: row.board,
    month: row.month,
    rank: Number(row.rank),
    isAnonymous: row.is_anonymous,
    awardedAt: row.awarded_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  };
}

function toExclusion(row: IExclusionRecord): ILeaderboardExclusion {
  return {
    exclusionId: row.global_id,
    month: row.month,
    board: row.board,
    userId: row.user_id,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    removedAt: row.removed_at,
    removedBy: row.removed_by,
  };
}
