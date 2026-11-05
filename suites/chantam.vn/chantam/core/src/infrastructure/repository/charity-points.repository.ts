import {
  ICharityDeliveryValue,
  ICharityPointAward,
  ICharityPointCaps,
  ICharityPointRule,
  ICharityPointsRepository,
  ICharitySettleResult,
  IPointLedgerRepository,
} from '@/domain/ports/repository';
import {
  CharityPointRuleCode,
  allowedUnderCaps,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IAwardRow {
  global_id: string;
  campaign_id: string;
  user_id: string;
  rule_code: CharityPointRuleCode;
  reference_type: string;
  reference_id: string;
  target_points: number;
  applied_points: number;
  ledger_seq: number;
  reason: string;
  updated_at: Date;
}

const AwardColumns = `global_id, campaign_id, user_id, rule_code, reference_type, reference_id,
  target_points, applied_points, ledger_seq, reason, updated_at`;

const toAward = (row: IAwardRow): ICharityPointAward => ({
  awardId: row.global_id,
  campaignId: row.campaign_id,
  userId: row.user_id,
  ruleCode: row.rule_code,
  referenceType: row.reference_type,
  referenceId: row.reference_id,
  targetPoints: row.target_points,
  appliedPoints: row.applied_points,
  reason: row.reason,
  updatedAt: row.updated_at,
});

/** Dự án từ thiện — điểm theo giá trị kèm trần (CHARITY-PROJECT-LIFECYCLE §3.9). */
@Injectable()
export class CharityPointsRepository implements ICharityPointsRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    // Repository gọi repository cùng tầng (như `CharityCampaignRepository`): bút toán phải
    // ghi TRONG transaction cập nhật `applied_points`.
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  public async findRule(
    code: CharityPointRuleCode,
  ): Promise<ICharityPointRule | null> {
    const [row] = await this.manager.query<
      { points: number; is_enabled: boolean }[]
    >(
      `SELECT points, is_enabled FROM point_rules WHERE code = $1 ORDER BY version DESC LIMIT 1`,
      [code],
    );
    return row ? { points: row.points, isEnabled: row.is_enabled } : null;
  }

  public async upsertAward(params: {
    campaignId: string;
    userId: string;
    ruleCode: CharityPointRuleCode;
    referenceType: string;
    referenceId: string;
    targetPoints: number;
    reason: string;
  }): Promise<ICharityPointAward> {
    const [row] = await this.manager.query<IAwardRow[]>(
      `INSERT INTO campaign_point_awards
         (campaign_id, user_id, rule_code, reference_type, reference_id, target_points, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (rule_code, reference_type, reference_id, user_id) DO UPDATE
         SET target_points = EXCLUDED.target_points, reason = EXCLUDED.reason,
             updated_at = now()
       RETURNING ${AwardColumns}`,
      [
        params.campaignId,
        params.userId,
        params.ruleCode,
        params.referenceType,
        params.referenceId,
        Math.max(0, params.targetPoints),
        params.reason,
      ],
    );
    return toAward(row);
  }

  public async findAwards(params: {
    ruleCode?: CharityPointRuleCode;
    referenceType: string;
    referenceId: string;
  }): Promise<ICharityPointAward[]> {
    const rows = await this.manager.query<IAwardRow[]>(
      `SELECT ${AwardColumns} FROM campaign_point_awards
       WHERE reference_type = $1 AND reference_id = $2
         AND ($3::varchar IS NULL OR rule_code = $3::varchar)
       ORDER BY id`,
      [params.referenceType, params.referenceId, params.ruleCode ?? null],
    );
    return rows.map(toAward);
  }

  public async settle(params: {
    awardId: string;
    caps: ICharityPointCaps;
    dayStart: Date;
  }): Promise<ICharitySettleResult> {
    return this.manager.transaction(async (manager) => {
      const [peek] = await manager.query<
        { user_id: string; rule_code: string }[]
      >(
        `SELECT user_id, rule_code FROM campaign_point_awards WHERE global_id = $1`,
        [params.awardId],
      );
      if (!peek) return { applied: 0, deferred: 0 };
      // Khoá theo (người + rule) TRƯỚC khi đọc số đã dùng: hai award cùng rule của một người
      // ghi song song không cùng lọt phần trần cuối.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `charity-points:${peek.user_id}:${peek.rule_code}`,
      ]);
      const [award] = await manager.query<IAwardRow[]>(
        `SELECT ${AwardColumns} FROM campaign_point_awards WHERE global_id = $1 FOR UPDATE`,
        [params.awardId],
      );
      const delta = award.target_points - award.applied_points;
      if (delta === 0) return { applied: 0, deferred: 0 };

      let applied = delta;
      if (delta > 0) {
        // Đã dùng trong từng cửa sổ = tổng bút toán DƯƠNG của rule này cho người này.
        const [used] = await manager.query<
          { daily: string; project: string; cycle: string | null }[]
        >(
          `SELECT
             COALESCE(SUM(entry.delta) FILTER (WHERE entry.created_at >= $3), 0) AS daily,
             COALESCE(SUM(entry.delta) FILTER (WHERE award.campaign_id = $4), 0) AS project,
             (SELECT COALESCE(SUM(inner_entry.delta), 0)
                FROM point_ledger inner_entry
                JOIN rank_maintenance_cycles cycle
                  ON cycle.user_id = inner_entry.user_id AND cycle.status = 'OPEN'
               WHERE inner_entry.user_id = $1 AND inner_entry.rule_code = $2
                 AND inner_entry.delta > 0 AND inner_entry.created_at >= cycle.cycle_start
             ) AS cycle
           FROM point_ledger entry
           LEFT JOIN campaign_point_awards award
             ON entry.reference_type = 'CHARITY_POINT_AWARD'
            AND award.global_id::text = entry.reference_id
           WHERE entry.user_id = $1 AND entry.rule_code = $2 AND entry.delta > 0`,
          [award.user_id, award.rule_code, params.dayStart, award.campaign_id],
        );
        const [{ has_cycle: hasCycle }] = await manager.query<
          { has_cycle: boolean }[]
        >(
          `SELECT EXISTS (SELECT 1 FROM rank_maintenance_cycles
                          WHERE user_id = $1 AND status = 'OPEN') AS has_cycle`,
          [award.user_id],
        );
        applied = allowedUnderCaps(delta, [
          { cap: params.caps.daily, used: Number(used?.daily ?? 0) },
          { cap: params.caps.project, used: Number(used?.project ?? 0) },
          {
            cap: hasCycle ? params.caps.cycle : null,
            used: Number(used?.cycle ?? 0),
          },
        ]);
        if (applied === 0) return { applied: 0, deferred: delta };
      }

      const seq = award.ledger_seq + 1;
      await this.ledger.appendAdjustmentWithinTransaction(manager, {
        userId: award.user_id,
        ruleCode: award.rule_code,
        delta: applied,
        referenceType: 'CHARITY_POINT_AWARD',
        referenceId: award.global_id,
        idempotencyKey: `CHARITY_AWARD:${award.global_id}:${seq}`,
        actor: 'SYSTEM',
        source: 'CHARITY_PROJECT',
        reason: applied < 0 ? `Điều chỉnh giảm: ${award.reason}` : award.reason,
      });
      await manager.query(
        `UPDATE campaign_point_awards
         SET applied_points = applied_points + $2, ledger_seq = $3, updated_at = now()
         WHERE global_id = $1`,
        [award.global_id, applied, seq],
      );
      return { applied, deferred: delta - applied };
    });
  }

  public async listUnsettled(limit: number): Promise<ICharityPointAward[]> {
    const rows = await this.manager.query<IAwardRow[]>(
      `SELECT ${AwardColumns} FROM campaign_point_awards
       WHERE applied_points <> target_points ORDER BY id LIMIT $1`,
      [limit],
    );
    return rows.map(toAward);
  }

  public async deliveryValue(
    deliveryId: string,
  ): Promise<ICharityDeliveryValue | null> {
    const [row] = await this.manager.query<
      {
        global_id: string;
        campaign_id: string;
        contributor_id: string;
        completed_by: string | null;
        completed_at: Date;
        confirmed_value: string | number;
      }[]
    >(
      `SELECT delivery.global_id, delivery.campaign_id, delivery.contributor_id,
              delivery.completed_by, delivery.completed_at,
              COALESCE(delivery.confirmed_value_adjusted,
                       (SELECT COALESCE(SUM(item.confirmed_value), 0)
                          FROM campaign_delivery_items item
                         WHERE item.delivery_id = delivery.global_id)) AS confirmed_value
       FROM campaign_deliveries delivery
       WHERE delivery.global_id = $1 AND delivery.status = 'COMPLETED'`,
      [deliveryId],
    );
    return row
      ? {
          deliveryId: row.global_id,
          campaignId: row.campaign_id,
          contributorId: row.contributor_id,
          completedBy: row.completed_by,
          completedAt: row.completed_at,
          confirmedValue: Number(row.confirmed_value),
        }
      : null;
  }

  public async listDeliveriesWithoutAward(
    days: number,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.manager.query<{ global_id: string }[]>(
      `SELECT delivery.global_id FROM campaign_deliveries delivery
       WHERE delivery.status = 'COMPLETED'
         AND delivery.completed_at >= now() - make_interval(days => $1::int)
         AND NOT EXISTS (SELECT 1 FROM campaign_point_awards award
                         WHERE award.rule_code = 'CHARITY_ITEM_VALUE'
                           AND award.reference_type = 'CHARITY_DELIVERY'
                           AND award.reference_id = delivery.global_id::text)
       ORDER BY delivery.id LIMIT $2`,
      [days, limit],
    );
    return rows.map((row) => row.global_id);
  }

  public async zeroAwardsForRemovedPosts(limit: number): Promise<number> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_point_awards award
       SET target_points = 0, reason = 'Bài đã bị gỡ hoặc ẩn', updated_at = now()
       WHERE award.global_id IN (
         SELECT candidate.global_id FROM campaign_point_awards candidate
         JOIN campaign_posts post ON post.global_id::text = candidate.reference_id
         WHERE candidate.reference_type = 'CHARITY_CAMPAIGN_POST'
           AND candidate.target_points > 0
           AND (post.deleted_at IS NOT NULL OR post.hidden_at IS NOT NULL)
         LIMIT $1)
       RETURNING award.global_id`,
      [limit],
    );
    return rows.length;
  }

  public async setDeliveryAdjustedValue(params: {
    deliveryId: string;
    value: number;
  }): Promise<void> {
    await this.manager.query(
      `UPDATE campaign_deliveries SET confirmed_value_adjusted = $2 WHERE global_id = $1`,
      [params.deliveryId, params.value],
    );
  }
}
