import { IPointFeedRepository, IPointFeedRow } from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IListParams {
  afterId: number | null;
  upToId: number | null;
  limit: number;
  userId: string | null;
  minDelta: number;
  excludedRuleCodes: readonly string[];
  mergedRuleCodes: readonly string[];
}

/** Ai hiện trên bảng tin CHUNG: còn hoạt động, chưa khoá, chưa xoá, bật cờ. */
const VisibleAccountSql = `account.status = 'ACTIVE' AND account.deleted_at IS NULL
         AND (account.suspended_until IS NULL OR account.suspended_until <= now())
         AND account.show_in_public_point_feed`;

/**
 * Câu đọc bảng tin điểm (CR 22/11/2026). Tách ra để phép kiểm DB thật `EXPLAIN` được đúng câu
 * này. Chỉ ghép HẰNG SỐ (thứ tự, điều kiện theo người) — mọi giá trị đi qua tham số.
 *
 * - Chỉ bút toán DƯƠNG, rule không nằm trong tập loại trừ hay tập gộp.
 * - Thưởng (`mergedRuleCodes`, `reference_type = 'POINT_LEDGER'`) cộng vào dòng gốc.
 * - Ngữ cảnh chỉ là chiến dịch từ thiện CÔNG KHAI (qua award hoặc đóng góp), chỉ `{ id, title }`.
 */
export function pointFeedListSql(options: {
  userScoped: boolean;
  ascending: boolean;
}): { sql: string; params: (input: IListParams) => unknown[] } {
  const sql = `
    SELECT entry.id::text AS id, entry.user_id, account.username, account.full_name,
           account.avatar_url, account.rank, entry.rule_code, entry.delta, entry.created_at,
           COALESCE(bonus.total, 0)::int AS bonus_delta,
           context.global_id AS campaign_id, context.title AS campaign_title,
           bonus.percent AS point_bonus_percent,
           COALESCE(context.is_public, false) AS campaign_public
      FROM point_ledger entry
      JOIN users account ON account.global_id = entry.user_id
      LEFT JOIN LATERAL (
        SELECT SUM(merged.delta) AS total,
               -- Hệ số LÚC GHI (review M6), không phải hệ số hiện tại của chiến dịch.
               MAX(merged.bonus_percent) AS percent
          FROM point_ledger merged
         WHERE merged.rule_code = ANY($6::text[])
           AND merged.reference_type = 'POINT_LEDGER'
           AND merged.reference_id = entry.id::text
      ) bonus ON true
      LEFT JOIN LATERAL (
        SELECT campaign.global_id, campaign.title, campaign.point_bonus_percent,
               (campaign.approval_status = 'APPROVED' AND campaign.deleted_at IS NULL
                AND (campaign.is_active OR campaign.end_time <= now())
                AND source.name_public) AS is_public
          FROM (
            -- Nguồn của bút toán và người đó có cho hiện tên ở chiến dịch không (review I6):
            -- không cho thì dòng điểm vẫn hiện nhưng không kèm chiến dịch.
            SELECT award.campaign_id,
                   CASE award.reference_type
                     WHEN 'CHARITY_CAMPAIGN_POST' THEN true
                     WHEN 'CHARITY_PARTICIPATION' THEN COALESCE(
                       (SELECT participation.show_name_publicly
                          FROM campaign_participations participation
                         WHERE participation.campaign_id = award.campaign_id
                           AND participation.user_id = award.user_id), false)
                     WHEN 'CHARITY_DELIVERY' THEN COALESCE(
                       (SELECT contribution.show_name_publicly
                          FROM campaign_deliveries delivery
                          JOIN campaign_contributions contribution
                            ON contribution.global_id = delivery.contribution_id
                         WHERE delivery.global_id::text = award.reference_id), false)
                     ELSE false
                   END AS name_public
              FROM campaign_point_awards award
             WHERE entry.reference_type = 'CHARITY_POINT_AWARD'
               AND award.global_id::text = entry.reference_id
            UNION ALL
            SELECT contribution.campaign_id, contribution.show_name_publicly
              FROM campaign_contributions contribution
             WHERE entry.reference_type = 'CHARITY_CONTRIBUTION'
               AND contribution.global_id::text = entry.reference_id
          ) source
          JOIN campaigns campaign ON campaign.global_id = source.campaign_id
         LIMIT 1
      ) context ON true
     WHERE entry.delta > 0
       AND entry.rule_code <> ALL($5::text[])
       AND entry.rule_code <> ALL($6::text[])
       AND account.username IS NOT NULL
       AND ${options.userScoped ? 'entry.user_id = $3::uuid' : `$3::uuid IS NULL AND ${VisibleAccountSql}`}
       AND ($1::bigint IS NULL OR entry.id > $1::bigint)
       AND ($7::bigint IS NULL OR entry.id <= $7::bigint)
       AND entry.delta + COALESCE(bonus.total, 0) >= $4::int
     ORDER BY entry.id ${options.ascending ? 'ASC' : 'DESC'}
     LIMIT $2`;
  return {
    sql,
    params: (input) => [
      input.afterId,
      input.limit,
      input.userId,
      input.minDelta,
      [...input.excludedRuleCodes],
      [...input.mergedRuleCodes],
      input.upToId,
    ],
  };
}

@Injectable()
export class PointFeedRepository implements IPointFeedRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async list(params: IListParams): Promise<IPointFeedRow[]> {
    const statement = pointFeedListSql({
      userScoped: params.userId !== null,
      ascending: params.afterId !== null,
    });
    const rows = await this.manager.query<
      {
        id: string;
        user_id: string;
        username: string;
        full_name: string | null;
        avatar_url: string | null;
        rank: UserRanks;
        rule_code: string;
        delta: number;
        created_at: Date;
        bonus_delta: number;
        campaign_id: string | null;
        campaign_title: string | null;
        point_bonus_percent: number | null;
        campaign_public: boolean;
      }[]
    >(statement.sql, statement.params(params));
    return rows.map((row) => ({
      entryId: Number(row.id),
      userId: row.user_id,
      username: row.username,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      rank: row.rank,
      ruleCode: row.rule_code,
      delta: Number(row.delta),
      bonusDelta: Number(row.bonus_delta),
      bonusPercent:
        row.point_bonus_percent === null
          ? null
          : Number(row.point_bonus_percent),
      occurredAt: row.created_at,
      context:
        row.campaign_public && row.campaign_id && row.campaign_title
          ? {
              type: 'CHARITY_CAMPAIGN' as const,
              id: row.campaign_id,
              title: row.campaign_title,
            }
          : null,
    }));
  }

  public async latestId(userId: string | null): Promise<number | null> {
    const [row] = await this.manager.query<{ id: string | null }[]>(
      userId === null
        ? `SELECT max(id)::text AS id FROM point_ledger`
        : `SELECT max(id)::text AS id FROM point_ledger WHERE user_id = $1`,
      userId === null ? [] : [userId],
    );
    return row?.id ? Number(row.id) : null;
  }

  public async isFeedVisible(userId: string): Promise<boolean> {
    const [row] = await this.manager.query<{ visible: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM users account
                       WHERE account.global_id = $1 AND ${VisibleAccountSql}) AS visible`,
      [userId],
    );
    return Boolean(row?.visible);
  }
}
