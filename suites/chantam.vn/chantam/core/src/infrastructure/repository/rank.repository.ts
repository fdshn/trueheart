import { evaluateRank } from '@/application/implementations/rank/rank-policy';
import {
  RankTierUnavailableException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { IGiveActivityCounter } from '@/domain/ports/give-activity.counter';
import {
  IRankMaintenanceCycleSummary,
  IRankRepository,
  IRankSummary,
  IRankTierSummary,
} from '@/domain/ports/repository';
import { RankOrder, UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IRawRankSummaryRow {
  rank: UserRanks;
  lifetime_points: string | null;
  threshold_points: string | null;
  required_gifts: string | null;
  required_referrals: string | null;
  post_quota: string | null;
  qualified_referrals: string;
  maintenance_rank: UserRanks | null;
  cycle_start: Date | null;
  cycle_end: Date | null;
  gifts_done: string | null;
  referrals_done: string | null;
  maintenance_status: 'OPEN' | 'UNEVALUATED' | 'SATISFIED' | 'FAILED' | null;
}

interface IRawRankTierRow {
  rank: UserRanks;
  threshold_points: string;
  required_gifts: string;
  required_referrals: string;
  post_quota: string;
}

interface IRawOnboardingPromotionRow {
  rank: UserRanks;
  lifetime_points: string | null;
}

interface IRawMaintenanceEvaluationRow {
  rank: UserRanks;
  lifetime_points: string | null;
  maintenance_gifts: string;
  maintenance_referrals: string;
  qualified_referrals: string;
}

interface IRawDueMaintenanceCycle {
  id: string;
  user_id: string;
  rank: UserRanks;
  cycle_start: Date;
  cycle_end: Date;
}

@Injectable()
export class RankRepository implements IRankRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IGiveActivityCounter)
    private readonly giveActivityCounter?: IGiveActivityCounter,
  ) {}

  public async evaluateDueMaintenanceCycles(): Promise<number> {
    return this.manager.transaction(async (manager) => {
      const cycles = await manager.query<IRawDueMaintenanceCycle[]>(
        `
          SELECT id, user_id, rank, cycle_start, cycle_end
          FROM rank_maintenance_cycles
          WHERE status = 'OPEN'
            AND cycle_end <= now()
          ORDER BY cycle_end ASC, id ASC
          FOR UPDATE SKIP LOCKED
        `,
      );

      for (const cycle of cycles) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          cycle.user_id,
        ]);

        const [user] = await manager.query<IRawMaintenanceEvaluationRow[]>(
          `
            SELECT
              user.rank,
              balance.lifetime AS lifetime_points,
              tier.maintenance_gifts,
              tier.maintenance_referrals,
              qualified_referrals.qualified_referrals
            FROM users user
            LEFT JOIN user_point_balances balance ON balance.user_id = user.global_id
            INNER JOIN rank_tiers tier ON tier.rank = user.rank
            CROSS JOIN LATERAL (
              SELECT COUNT(*)::text AS qualified_referrals
              FROM referrals referral
              WHERE referral.referrer_id = user.global_id
                AND referral.qualified_at IS NOT NULL
            ) qualified_referrals
            WHERE user.global_id = $1
            FOR UPDATE OF user
          `,
          [cycle.user_id],
        );

        if (!user) continue;

        const activity = await this.giveActivityCounter!.countCompletedGifts({
          userId: cycle.user_id,
          cycleStart: cycle.cycle_start,
          cycleEnd: cycle.cycle_end,
          rank: cycle.rank,
        });
        const giftsDone = activity.available ? activity.completedGifts : 0;
        const referralsDone = Number(user.qualified_referrals);
        const evaluation = evaluateRank(
          activity.available
            ? {
                mode: 'MAINTENANCE',
                currentRank: user.rank,
                isMember: user.rank !== UserRanks.VIEWER,
                activityAvailable: true,
                maintenanceSatisfied:
                  giftsDone >= Number(user.maintenance_gifts) &&
                  referralsDone >= Number(user.maintenance_referrals),
              }
            : {
                mode: 'MAINTENANCE',
                currentRank: user.rank,
                isMember: user.rank !== UserRanks.VIEWER,
                activityAvailable: false,
              },
        );
        const status = evaluation.maintenanceStatus!;

        await manager.query(
          `
            UPDATE rank_maintenance_cycles
            SET gifts_done = $2,
                referrals_done = $3,
                status = $4,
                evaluated_at = now()
            WHERE id = $1
              AND status = 'OPEN'
          `,
          [cycle.id, giftsDone, referralsDone, status],
        );

        if (status === 'FAILED' && evaluation.rank !== user.rank) {
          await manager.query(
            `
              UPDATE users
              SET rank = $2, rank_attained_at = now()
              WHERE global_id = $1
                AND rank = $3
            `,
            [cycle.user_id, evaluation.rank, user.rank],
          );
          await manager.query(
            `
              INSERT INTO rank_transitions
                (user_id, from_rank, to_rank, reason, lifetime_points, cycle_id, actor)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              cycle.user_id,
              user.rank,
              evaluation.rank,
              'MAINTENANCE_FAILED',
              Number(user.lifetime_points ?? 0),
              cycle.id,
              'SYSTEM',
            ],
          );
        }

        if (this.isMaintenanceRank(evaluation.rank)) {
          await manager.query(
            `
              INSERT INTO rank_maintenance_cycles
                (user_id, rank, cycle_start, cycle_end)
              VALUES ($1, $2, $3, $3 + interval '3 months')
              ON CONFLICT DO NOTHING
            `,
            [cycle.user_id, evaluation.rank, cycle.cycle_end],
          );
        }
      }

      return cycles.length;
    });
  }

  public async promoteMemberOnboarding(userId: string): Promise<boolean> {
    return this.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        userId,
      ]);

      const [user] = await manager.query<IRawOnboardingPromotionRow[]>(
        `
          SELECT user.rank, balance.lifetime AS lifetime_points
          FROM users user
          LEFT JOIN user_point_balances balance ON balance.user_id = user.global_id
          WHERE user.global_id = $1
          FOR UPDATE OF user
        `,
        [userId],
      );

      if (!user) throw new UserNotFoundException();
      if (user.rank !== UserRanks.VIEWER) return false;

      const promoted = await manager.query<{ global_id: string }[]>(
        `
          UPDATE users
          SET rank = $2, rank_attained_at = now()
          WHERE global_id = $1
            AND rank = $3
          RETURNING global_id
        `,
        [userId, UserRanks.MEMBER, UserRanks.VIEWER],
      );
      if (promoted.length === 0) return false;

      await manager.query(
        `
          INSERT INTO rank_transitions
            (user_id, from_rank, to_rank, reason, lifetime_points, actor)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          userId,
          UserRanks.VIEWER,
          UserRanks.MEMBER,
          'ONBOARDING_COMPLETE',
          Number(user.lifetime_points ?? 0),
          'SYSTEM',
        ],
      );

      return true;
    });
  }

  public async getOwnSummary(userId: string): Promise<IRankSummary> {
    const [summary] = await this.manager.query<IRawRankSummaryRow[]>(
      `
        SELECT
          user.rank,
          balance.lifetime AS lifetime_points,
          current_tier.threshold_points,
          current_tier.required_gifts,
          current_tier.required_referrals,
          current_tier.post_quota,
          qualified_referrals.qualified_referrals,
          maintenance.rank AS maintenance_rank,
          maintenance.cycle_start,
          maintenance.cycle_end,
          maintenance.gifts_done,
          maintenance.referrals_done,
          maintenance.status AS maintenance_status
        FROM users user
        LEFT JOIN user_point_balances balance ON balance.user_id = user.global_id
        LEFT JOIN rank_tiers current_tier ON current_tier.rank = user.rank
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::text AS qualified_referrals
          FROM referrals referral
          WHERE referral.referrer_id = user.global_id
            AND referral.qualified_at IS NOT NULL
        ) qualified_referrals
        LEFT JOIN LATERAL (
          SELECT rank, cycle_start, cycle_end, gifts_done, referrals_done, status
          FROM rank_maintenance_cycles
          WHERE user_id = user.global_id
            AND status IN ('OPEN', 'UNEVALUATED')
          ORDER BY cycle_start DESC
          LIMIT 1
        ) maintenance ON user.rank IN ('SILVER', 'GOLD', 'DIAMOND')
        WHERE user.global_id = $1
      `,
      [userId],
    );

    if (!summary) throw new UserNotFoundException();

    const currentTier = this.mapRequiredTier(summary);
    const nextRank = this.getNextRank(summary.rank);
    const nextTier = nextRank ? await this.getTier(nextRank) : null;

    return {
      rank: summary.rank,
      lifetimePoints: Number(summary.lifetime_points ?? 0),
      currentTier,
      nextTier,
      qualifiedReferrals: Number(summary.qualified_referrals),
      maintenanceCycle: this.mapMaintenanceCycle(summary),
    };
  }

  private async getTier(rank: UserRanks): Promise<IRankTierSummary> {
    const [tier] = await this.manager.query<IRawRankTierRow[]>(
      `
        SELECT rank, threshold_points, required_gifts, required_referrals, post_quota
        FROM rank_tiers
        WHERE rank = $1
      `,
      [rank],
    );

    if (!tier) throw new RankTierUnavailableException(rank);
    return this.mapTier(tier);
  }

  private mapRequiredTier(summary: IRawRankSummaryRow): IRankTierSummary {
    if (
      summary.threshold_points === null ||
      summary.required_gifts === null ||
      summary.required_referrals === null ||
      summary.post_quota === null
    ) {
      throw new RankTierUnavailableException(summary.rank);
    }

    return {
      rank: summary.rank,
      thresholdPoints: Number(summary.threshold_points),
      requiredGifts: Number(summary.required_gifts),
      requiredReferrals: Number(summary.required_referrals),
      postQuota: Number(summary.post_quota),
    };
  }

  private mapTier(tier: IRawRankTierRow): IRankTierSummary {
    return {
      rank: tier.rank,
      thresholdPoints: Number(tier.threshold_points),
      requiredGifts: Number(tier.required_gifts),
      requiredReferrals: Number(tier.required_referrals),
      postQuota: Number(tier.post_quota),
    };
  }

  private mapMaintenanceCycle(
    summary: IRawRankSummaryRow,
  ): IRankMaintenanceCycleSummary | null {
    if (
      summary.maintenance_rank === null ||
      summary.cycle_start === null ||
      summary.cycle_end === null ||
      summary.gifts_done === null ||
      summary.referrals_done === null ||
      summary.maintenance_status === null
    ) {
      return null;
    }

    return {
      rank: summary.maintenance_rank,
      cycleStart: summary.cycle_start,
      cycleEnd: summary.cycle_end,
      giftsDone: Number(summary.gifts_done),
      referralsDone: Number(summary.referrals_done),
      status: summary.maintenance_status,
    };
  }

  private isMaintenanceRank(rank: UserRanks): boolean {
    return [UserRanks.SILVER, UserRanks.GOLD, UserRanks.DIAMOND].includes(rank);
  }

  private getNextRank(rank: UserRanks): UserRanks | null {
    return RankOrder[RankOrder.indexOf(rank) + 1] ?? null;
  }
}
