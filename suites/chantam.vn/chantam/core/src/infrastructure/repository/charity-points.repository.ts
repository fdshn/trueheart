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
  CharityCampaignBonusRuleCode,
  CharityPointRuleCode,
  allowedUnderCaps,
  bonusAdjustmentTarget,
  bonusPoints,
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
  base_award_id: string | null;
}

const AwardColumns = `global_id, campaign_id, user_id, rule_code, reference_type, reference_id,
  target_points, applied_points, ledger_seq, reason, updated_at, base_award_id`;

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
  baseAwardId: row.base_award_id ?? null,
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
  }): Promise<ICharitySettleResult & { bonusApplied: number }> {
    return this.manager.transaction(async (manager) => {
      const [peek] = await manager.query<
        { user_id: string; rule_code: string }[]
      >(
        `SELECT user_id, rule_code FROM campaign_point_awards WHERE global_id = $1`,
        [params.awardId],
      );
      if (!peek || peek.rule_code === CharityCampaignBonusRuleCode)
        return { applied: 0, deferred: 0, bonusApplied: 0 };
      // Khoá theo (người + rule GỐC) TRƯỚC khi đọc số đã dùng: hai award cùng rule của một người
      // ghi song song không cùng lọt phần trần cuối. Thưởng của rule đó ghi dưới CÙNG khoá.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `charity-points:${peek.user_id}:${peek.rule_code}`,
      ]);
      const [award] = await manager.query<IAwardRow[]>(
        `SELECT ${AwardColumns} FROM campaign_point_awards WHERE global_id = $1 FOR UPDATE`,
        [params.awardId],
      );
      const windows = async () => {
        const used = await this.usedUnderCaps(manager, award, params.dayStart);
        return [
          { cap: params.caps.daily, used: used.daily },
          { cap: params.caps.project, used: used.project },
          { cap: used.hasCycle ? params.caps.cycle : null, used: used.cycle },
        ];
      };

      // ── Điểm gốc ──
      const delta = award.target_points - award.applied_points;
      let applied = 0;
      let baseEntryId: number | null = null;
      if (delta !== 0) {
        applied = delta > 0 ? allowedUnderCaps(delta, await windows()) : delta;
        if (applied !== 0) {
          const seq = award.ledger_seq + 1;
          const entry = await this.ledger.appendAdjustmentWithinTransaction(
            manager,
            {
              userId: award.user_id,
              ruleCode: award.rule_code,
              delta: applied,
              referenceType: 'CHARITY_POINT_AWARD',
              referenceId: award.global_id,
              idempotencyKey: `CHARITY_AWARD:${award.global_id}:${seq}`,
              actor: 'SYSTEM',
              source: 'CHARITY_PROJECT',
              reason:
                applied < 0 ? `Điều chỉnh giảm: ${award.reason}` : award.reason,
            },
          );
          baseEntryId = entry.entryId;
          await manager.query(
            `UPDATE campaign_point_awards
             SET applied_points = applied_points + $2, ledger_seq = $3, updated_at = now()
             WHERE global_id = $1`,
            [award.global_id, applied, seq],
          );
        }
      }

      // ── Thưởng hệ số chiến dịch (CR 22/11/2026): SAU điểm gốc, cùng transaction ──
      const bonusApplied = await this.settleBonus(manager, {
        award,
        baseApplied: applied,
        baseEntryId,
        windows,
      });
      return { applied, deferred: delta - applied, bonusApplied };
    });
  }

  /**
   * Thưởng của một award gốc. Gốc vừa ghi dương → mục tiêu thưởng cộng `floor(gốc × % / 100)`
   * theo hệ số LÚC NÀY; gốc bị trừ → mục tiêu thưởng co theo tỉ lệ và phần chênh âm ghi ngay.
   * Phần dương ghi theo trần CHUNG với rule gốc (gốc đã được tính trước — gốc ưu tiên), vướng
   * trần thì hoãn. Bút toán thưởng trỏ `POINT_LEDGER` = bút toán gốc (mới nhất của award gốc
   * khi chỉ ghi tiếp phần thưởng đang hoãn).
   */
  private async settleBonus(
    manager: EntityManager,
    input: {
      award: IAwardRow;
      baseApplied: number;
      baseEntryId: number | null;
      windows: () => Promise<{ cap: number | null; used: number }[]>;
    },
  ): Promise<number> {
    const { award } = input;
    let [bonus] = await manager.query<IAwardRow[]>(
      `SELECT ${AwardColumns} FROM campaign_point_awards
        WHERE base_award_id = $1 FOR UPDATE`,
      [award.global_id],
    );
    const [campaign] = await manager.query<{ percent: number }[]>(
      `SELECT point_bonus_percent AS percent FROM campaigns WHERE global_id = $1`,
      [award.campaign_id],
    );
    const percent = Number(campaign?.percent ?? 0);
    if (input.baseApplied > 0) {
      const wanted = bonusPoints(input.baseApplied, percent);
      if (wanted > 0) {
        if (!bonus)
          [bonus] = await manager.query<IAwardRow[]>(
            `INSERT INTO campaign_point_awards
               (campaign_id, user_id, rule_code, reference_type, reference_id,
                target_points, reason, base_award_id)
             VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
             RETURNING ${AwardColumns}`,
            // Tham chiếu CHÍNH award gốc (không chép tham chiếu của gốc): một bài có cả clip
            // lẫn ảnh có hai award gốc cùng tham chiếu bài — chép thì hai award thưởng đụng
            // UQ_campaign_point_awards_reference.
            [
              award.campaign_id,
              award.user_id,
              CharityCampaignBonusRuleCode,
              'CHARITY_POINT_AWARD',
              award.global_id,
              `Thưởng hệ số chiến dịch: ${award.reason}`.slice(0, 300),
              award.global_id,
            ],
          );
        bonus.target_points += wanted;
      }
    } else if (input.baseApplied < 0 && bonus) {
      // Co MỤC TIÊU thưởng theo tỉ lệ gốc (không co theo phần đã ghi): phần thưởng đang hoãn vì
      // trần không bị mất khi gốc chỉ giảm một phần.
      bonus.target_points = bonusAdjustmentTarget({
        bonusApplied: bonus.target_points,
        baseAppliedBefore: award.applied_points,
        baseAppliedAfter: award.applied_points + input.baseApplied,
      });
    }
    if (!bonus) return 0;

    const delta = bonus.target_points - bonus.applied_points;
    const applied =
      delta > 0 ? allowedUnderCaps(delta, await input.windows()) : delta;
    if (applied !== 0) {
      const referenceId =
        input.baseEntryId ??
        (
          await manager.query<{ id: string | null }[]>(
            `SELECT max(id)::text AS id FROM point_ledger
              WHERE reference_type = 'CHARITY_POINT_AWARD' AND reference_id = $1`,
            [award.global_id],
          )
        )[0]?.id;
      if (referenceId === null || referenceId === undefined) return 0;
      const seq = bonus.ledger_seq + 1;
      await this.ledger.appendAdjustmentWithinTransaction(manager, {
        userId: bonus.user_id,
        ruleCode: CharityCampaignBonusRuleCode,
        delta: applied,
        referenceType: 'POINT_LEDGER',
        referenceId: String(referenceId),
        idempotencyKey: `CHARITY_AWARD:${bonus.global_id}:${seq}`,
        actor: 'SYSTEM',
        source: 'CHARITY_PROJECT',
        reason: applied < 0 ? `Điều chỉnh giảm: ${bonus.reason}` : bonus.reason,
        // Hệ số LÚC GHI cho bảng tin điểm (review M6); bút toán trừ không mang hệ số.
        bonusPercent: applied > 0 && percent > 0 ? percent : null,
      });
      bonus.applied_points += applied;
      bonus.ledger_seq = seq;
    }
    await manager.query(
      `UPDATE campaign_point_awards
          SET target_points = $2, applied_points = $3, ledger_seq = $4, updated_at = now()
        WHERE global_id = $1`,
      [
        bonus.global_id,
        bonus.target_points,
        bonus.applied_points,
        bonus.ledger_seq,
      ],
    );
    return applied;
  }

  /**
   * Đã dùng trong từng cửa sổ trần của rule GỐC: bút toán dương của rule đó + bút toán thưởng
   * dương trỏ tới bút toán của rule đó. Cửa sổ dự án đi qua award của bút toán gốc.
   */
  private async usedUnderCaps(
    manager: EntityManager,
    award: IAwardRow,
    dayStart: Date,
  ): Promise<{
    daily: number;
    project: number;
    cycle: number;
    hasCycle: boolean;
  }> {
    const [used] = await manager.query<
      { daily: string; project: string; cycle: string; has_cycle: boolean }[]
    >(
      `WITH counted AS (
         SELECT entry.delta, entry.created_at, owner_award.campaign_id
           FROM point_ledger entry
           LEFT JOIN campaign_point_awards owner_award
             ON entry.reference_type = 'CHARITY_POINT_AWARD'
            AND owner_award.global_id::text = entry.reference_id
          WHERE entry.user_id = $1 AND entry.rule_code = $2 AND entry.delta > 0
         UNION ALL
         SELECT bonus.delta, bonus.created_at, owner_award.campaign_id
           FROM point_ledger bonus
           JOIN point_ledger base
             ON bonus.reference_type = 'POINT_LEDGER' AND base.id::text = bonus.reference_id
           LEFT JOIN campaign_point_awards owner_award
             ON base.reference_type = 'CHARITY_POINT_AWARD'
            AND owner_award.global_id::text = base.reference_id
          WHERE bonus.user_id = $1 AND bonus.rule_code = '${CharityCampaignBonusRuleCode}'
            AND bonus.delta > 0 AND base.rule_code = $2
       ), cycle AS (
         SELECT cycle_start FROM rank_maintenance_cycles
          WHERE user_id = $1 AND status = 'OPEN'
          ORDER BY cycle_start DESC LIMIT 1
       )
       SELECT
         COALESCE((SELECT SUM(delta) FROM counted WHERE created_at >= $3), 0)::text AS daily,
         COALESCE((SELECT SUM(delta) FROM counted WHERE campaign_id = $4), 0)::text AS project,
         COALESCE((SELECT SUM(counted.delta) FROM counted, cycle
                    WHERE counted.created_at >= cycle.cycle_start), 0)::text AS cycle,
         EXISTS (SELECT 1 FROM cycle) AS has_cycle`,
      [award.user_id, award.rule_code, dayStart, award.campaign_id],
    );
    return {
      daily: Number(used?.daily ?? 0),
      project: Number(used?.project ?? 0),
      cycle: Number(used?.cycle ?? 0),
      hasCycle: Boolean(used?.has_cycle),
    };
  }

  public async listUnsettled(limit: number): Promise<ICharityPointAward[]> {
    const rows = await this.manager.query<IAwardRow[]>(
      // Award thưởng không bao giờ ghi một mình: award GỐC lên danh sách khi chính nó hoặc
      // award thưởng đi cặp còn chênh — settle gốc là settle luôn thưởng.
      `SELECT ${AwardColumns} FROM campaign_point_awards award
       WHERE award.rule_code <> '${CharityCampaignBonusRuleCode}'
         AND (award.applied_points <> award.target_points
              OR EXISTS (SELECT 1 FROM campaign_point_awards bonus
                          WHERE bonus.base_award_id = award.global_id
                            AND bonus.applied_points <> bonus.target_points))
       ORDER BY award.id LIMIT $1`,
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
