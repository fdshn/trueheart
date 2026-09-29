import { evaluateRank } from '@/application/implementations/rank/rank-policy';
import {
  RankTierUnavailableException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { IGiveActivityCounter } from '@/domain/ports/give-activity.counter';
import {
  IAdminConfigRepository,
  IMaintenanceReminder,
  IRankChange,
  IRankMaintenanceCycleSummary,
  IRankRepository,
  IRankSummary,
  IRankTierSummary,
} from '@/domain/ports/repository';
import { RankOrder, UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  RankPointsSourceConfigKey,
  normalizeRankPointsSourceConfig,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IRawRankSummaryRow {
  rank: UserRanks;
  lifetime_points: string | null;
  balance_points: string | null;
  threshold_points: string | null;
  warning_points: string | null;
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
  warning_points: string;
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
  balance_points: string | null;
  qualified_referrals: string;
  total_qualified_referrals: string;
}

interface IRawNormalRankEvaluationRow {
  rank: UserRanks;
  balance_points: string | null;
  promotion_locked_until: Date | null;
  qualified_referrals: string;
}

interface IRawNormalRankTierRow {
  rank: UserRanks;
  threshold_points: string;
  required_gifts: string;
  required_referrals: string;
}

interface IRawDueMaintenanceCycle {
  id: string;
  user_id: string;
  rank: UserRanks;
  cycle_start: Date;
  cycle_end: Date;
  required_gifts: string;
  required_referrals: string;
  policy_version: string;
}

@Injectable()
export class RankRepository implements IRankRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IGiveActivityCounter)
    private readonly giveActivityCounter?: IGiveActivityCounter,
    // Tuỳ chọn để mọi bài kiểm dựng repository bằng tay không phải biết tới nó.
    // Thiếu thì `rankPointsColumn()` lùi về mặc định, tức giữ nguyên hành vi.
    @Inject(IAdminConfigRepository)
    private readonly adminConfig?: IAdminConfigRepository,
  ) {}

  /**
   * Cột điểm dùng để xét hạng, do Admin chọn.
   *
   * Hai cột nói hai chuyện khác nhau:
   *
   * - `balance` — điểm TIÊU ĐƯỢC. Tiêu điểm đổi vật phẩm làm tụt hạng, và khoản
   *   phạt `SHIP_UNPAID_PENALTY` (−50) cũng làm tụt hạng. Hạng là "đang giữ bao
   *   nhiêu", giống số dư tài khoản.
   * - `lifetime` — điểm TÍCH LUỸ, chỉ tăng. Hạng là bằng ghi nhận đã đóng góp,
   *   và không ai mất hạng vì đã tiêu điểm mình kiếm được.
   *
   * Để Admin chọn vì đây là quyết định sản phẩm, không phải quyết định kỹ
   * thuật — và nó đã bị đổi qua lại một lần (2026-09-24). Mặc định `BALANCE`
   * giữ nguyên hành vi đang chạy: một cấu hình mới không được lặng lẽ đổi thứ
   * hạng của tất cả mọi người ngay lúc deploy.
   *
   * Trả về TÊN CỘT chứ không phải giá trị người dùng nhập: chuỗi này ghép thẳng
   * vào SQL, nên nó phải đến từ một tập đóng do mã quyết định.
   */
  private async rankPointsColumn(): Promise<'balance' | 'lifetime'> {
    const config = normalizeRankPointsSourceConfig(
      await this.adminConfig?.getConfigValue(RankPointsSourceConfigKey),
    );

    return config.source === 'LIFETIME' ? 'lifetime' : 'balance';
  }

  public async reconcileNormalRank(
    userId: string,
  ): Promise<IRankChange | null> {
    return this.manager.transaction('SERIALIZABLE', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        userId,
      ]);

      const pointsColumn = await this.rankPointsColumn();
      const [user] = await manager.query<IRawNormalRankEvaluationRow[]>(
        `
          SELECT
            user_account.rank,
            balance.${pointsColumn} AS balance_points,
            user_account.promotion_locked_until,
            qualified_referrals.qualified_referrals
          FROM users user_account
          LEFT JOIN user_point_balances balance ON balance.user_id = user_account.global_id
          CROSS JOIN LATERAL (
            SELECT COUNT(*)::text AS qualified_referrals
            FROM referrals referral
            WHERE referral.referrer_id = user_account.global_id
              AND referral.qualified_at IS NOT NULL
          ) qualified_referrals
          WHERE user_account.global_id = $1
          FOR UPDATE OF user_account
        `,
        [userId],
      );
      if (!user) throw new UserNotFoundException();
      if (user.rank === UserRanks.VIEWER) return null;

      const tiers = await manager.query<IRawNormalRankTierRow[]>(`
        SELECT rank, threshold_points, required_gifts, required_referrals
        FROM rank_tiers
        ORDER BY threshold_points ASC
      `);
      const activity =
        await this.giveActivityCounter!.countLifetimeCompletedGifts({
          userId,
          rank: user.rank,
        });
      if (!activity.available) return null;

      const evaluation = evaluateRank({
        mode: 'NORMAL',
        currentRank: user.rank,
        isMember: true,
        balancePoints: Number(user.balance_points ?? 0),
        completedGifts: activity.completedGifts,
        qualifiedReferrals: Number(user.qualified_referrals),
        promotionLockedUntil: user.promotion_locked_until,
        now: new Date(),
        tiers: tiers.map((tier) => ({
          rank: tier.rank,
          thresholdPoints: Number(tier.threshold_points),
          requiredGifts: Number(tier.required_gifts),
          requiredReferrals: Number(tier.required_referrals),
        })),
      });
      if (evaluation.rank === user.rank) return null;

      // `AND rank = $3` là một phép so-rồi-đổi: nếu ai đó vừa đổi hạng xen
      // vào giữa thì câu này không khớp dòng nào và KHÔNG được ghi
      // `rank_transitions`, nếu không lịch sử hạng sẽ có bản ghi cho một lần
      // thăng hạng chưa từng xảy ra.
      const promoted = await updateReturning<{ global_id: string }>(
        manager,
        `
          UPDATE users
          SET rank = $2, rank_attained_at = now()
          WHERE global_id = $1
            AND rank = $3
          RETURNING global_id
        `,
        [userId, evaluation.rank, user.rank],
      );
      if (promoted.length === 0) return null;

      await manager.query(
        `
          INSERT INTO rank_transitions
            (user_id, from_rank, to_rank, reason, points_at_transition, actor)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          userId,
          user.rank,
          evaluation.rank,
          RankOrder.indexOf(evaluation.rank) > RankOrder.indexOf(user.rank)
            ? 'NORMAL_QUALIFICATION'
            : 'BALANCE_REEVALUATION',
          Number(user.balance_points ?? 0),
          'SYSTEM',
        ],
      );
      if (this.isMaintenanceRank(evaluation.rank)) {
        await manager.query(
          `
            INSERT INTO rank_maintenance_cycles
              (user_id, rank, cycle_start, cycle_end, required_gifts, required_referrals, policy_version)
            SELECT $1, $2, now(), now() + interval '3 months',
                   maintenance_gifts, maintenance_referrals, version
            FROM rank_tiers WHERE rank = $2
            ON CONFLICT DO NOTHING
          `,
          [userId, evaluation.rank],
        );
      }

      return {
        fromRank: user.rank,
        toRank: evaluation.rank,
        demoted:
          RankOrder.indexOf(evaluation.rank) < RankOrder.indexOf(user.rank),
      };
    });
  }

  public async findCyclesNeedingReminder(params: {
    remindBeforeDays: number;
    limit: number;
  }): Promise<IMaintenanceReminder[]> {
    // Tiến độ tính SỐNG, không đọc `cycle.gifts_done` / `cycle.referrals_done`.
    //
    // Hai cột đó chỉ được ghi ở bước ĐÁNH GIÁ, tức lúc chu kỳ đóng. Lời nhắc thì
    // gửi 30 ngày TRƯỚC đó, khi chu kỳ còn OPEN, nên hai cột luôn bằng 0 — và lời
    // nhắc đi ra với nội dung "bạn đã hoàn tất 0/2 lượt trao" kể cả với người đã
    // trao xong cả hai. Một con số sai trong thông báo còn tệ hơn không có số:
    // người làm đủ rồi bị bảo là chưa làm gì sẽ thôi tin những lời nhắc sau.
    //
    // Đếm bằng đúng hai câu mà bước đánh giá đếm, trên cùng cửa sổ chu kỳ, để
    // lời nhắc và kết quả cuối không bao giờ nói hai chuyện khác nhau.
    const rows = await this.manager.query<
      {
        cycle_id: string;
        user_id: string;
        rank: string;
        days_left: string;
        gifts_done: string;
        required_gifts: string;
        referrals_done: string;
        required_referrals: string;
        penalty_points: string;
      }[]
    >(
      `
        SELECT cycle.id AS cycle_id,
               cycle.user_id,
               cycle.rank,
               GREATEST(
                 0,
                 CEIL(EXTRACT(EPOCH FROM (cycle.cycle_end - now())) / 86400)
               ) AS days_left,
               gifts.gifts_done,
               cycle.required_gifts,
               referrals.referrals_done,
               cycle.required_referrals,
               tier.maintenance_penalty_points AS penalty_points
        FROM rank_maintenance_cycles cycle
        INNER JOIN rank_tiers tier ON tier.rank = cycle.rank
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::text AS gifts_done
          FROM gift_transactions deal
          WHERE deal.giver_id = cycle.user_id
            AND deal.status = 'COMPLETED'
            AND deal.completed_at >= cycle.cycle_start
            AND deal.completed_at < cycle.cycle_end
        ) gifts
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::text AS referrals_done
          FROM referrals invite
          WHERE invite.referrer_id = cycle.user_id
            AND invite.qualified_at >= cycle.cycle_start
            AND invite.qualified_at < cycle.cycle_end
        ) referrals
        WHERE cycle.status = 'OPEN'
          AND cycle.reminded_at IS NULL
          AND cycle.cycle_end > now()
          AND cycle.cycle_end <= now() + ($1 || ' days')::interval
        ORDER BY cycle.cycle_end ASC
        LIMIT $2
      `,
      [String(params.remindBeforeDays), params.limit],
    );

    return rows.map((row) => ({
      cycleId: row.cycle_id,
      userId: row.user_id,
      rank: row.rank,
      daysLeft: Number(row.days_left),
      giftsDone: Number(row.gifts_done),
      requiredGifts: Number(row.required_gifts),
      referralsDone: Number(row.referrals_done),
      requiredReferrals: Number(row.required_referrals),
      penaltyPoints: Number(row.penalty_points),
    }));
  }

  public async markCyclesReminded(cycleIds: string[]): Promise<void> {
    if (cycleIds.length === 0) return;

    await this.manager.query(
      `UPDATE rank_maintenance_cycles
       SET reminded_at = now()
       WHERE id = ANY($1::bigint[]) AND reminded_at IS NULL`,
      [cycleIds],
    );
  }

  public async findUnpenalizedFailedCycles(limit: number): Promise<
    {
      cycleId: string;
      userId: string;
      rank: string;
      penaltyPoints: number;
    }[]
  > {
    // `penalty > 0`: bậc không có chỉ tiêu duy trì thì không có gì để trừ, và
    // một khoản trừ 0 điểm chỉ làm bẩn sổ.
    const rows = await this.manager.query<
      {
        cycle_id: string;
        user_id: string;
        rank: string;
        penalty_points: string;
      }[]
    >(
      `
        SELECT cycle.id AS cycle_id,
               cycle.user_id,
               cycle.rank,
               tier.maintenance_penalty_points AS penalty_points
        FROM rank_maintenance_cycles cycle
        INNER JOIN rank_tiers tier ON tier.rank = cycle.rank
        WHERE cycle.status = 'FAILED'
          AND tier.maintenance_penalty_points > 0
          AND NOT EXISTS (
            SELECT 1 FROM point_ledger paid
            WHERE paid.idempotency_key = 'MAINTENANCE_FAILED:' || cycle.id
          )
        ORDER BY cycle.evaluated_at ASC NULLS FIRST, cycle.id ASC
        LIMIT $1
      `,
      [limit],
    );

    return rows.map((row) => ({
      cycleId: row.cycle_id,
      userId: row.user_id,
      rank: row.rank,
      penaltyPoints: Number(row.penalty_points),
    }));
  }

  public async evaluateDueMaintenanceCycles(): Promise<number> {
    return this.manager.transaction(async (manager) => {
      const cycles = await manager.query<IRawDueMaintenanceCycle[]>(
        `
          SELECT id, user_id, rank, cycle_start, cycle_end,
                 required_gifts, required_referrals, policy_version
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

        const pointsColumn = await this.rankPointsColumn();
        const [user] = await manager.query<IRawMaintenanceEvaluationRow[]>(
          `
            SELECT
              user_account.rank,
              balance.${pointsColumn} AS balance_points,
              qualified_referrals.qualified_referrals
              , total_referrals.total_qualified_referrals
            FROM users user_account
            LEFT JOIN user_point_balances balance ON balance.user_id = user_account.global_id
            CROSS JOIN LATERAL (
              SELECT COUNT(*)::text AS qualified_referrals
              FROM referrals referral
              WHERE referral.referrer_id = user_account.global_id
                AND referral.qualified_at >= $2
                AND referral.qualified_at < $3
            ) qualified_referrals
            CROSS JOIN LATERAL (
              SELECT COUNT(*)::text AS total_qualified_referrals
              FROM referrals referral
              WHERE referral.referrer_id = user_account.global_id
                AND referral.qualified_at IS NOT NULL
            ) total_referrals
            WHERE user_account.global_id = $1
            FOR UPDATE OF user_account
          `,
          // `cycle.rank` KHÔNG truyền vào: câu này không dùng tới nó, và một
          // tham số không xuất hiện trong câu lệnh làm Postgres không suy được
          // kiểu — lỗi 42P18 ngay lần đầu có chu kỳ tới hạn thật. Unit test
          // mock `query` nên không bao giờ thấy.
          [cycle.user_id, cycle.cycle_start, cycle.cycle_end],
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
        const maintenanceSatisfied =
          activity.available &&
          giftsDone >= Number(cycle.required_gifts) &&
          referralsDone >= Number(cycle.required_referrals);
        // Trượt nhiệm vụ KHÔNG còn ép tụt hạng (chốt 2026-09-24). Hạng do
        // balance quyết, nên nhiệm vụ tác động GIÁN TIẾP qua điểm: chu kỳ chỉ
        // được đánh FAILED ở đây, còn khoản trừ do tầng ứng dụng áp sau đó rồi
        // gọi `reconcileNormalRank` để xét lại theo balance mới.
        //
        // Hai cơ chế cùng trực tiếp quyết một thứ thì luôn có lúc nói ngược
        // nhau: hệ thống hạ người ta xuống Bạc, rồi lần xét kế tiếp thấy balance
        // vẫn ở mức Vàng và đẩy ngược lên.
        const evaluation = evaluateRank({
          mode: 'MAINTENANCE',
          currentRank: user.rank,
          isMember: user.rank !== UserRanks.VIEWER,
          ...(activity.available
            ? {
                activityAvailable: true,
                maintenanceSatisfied,
                fallbackRank: user.rank,
              }
            : { activityAvailable: false }),
        } as never);
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

        if (this.isMaintenanceRank(evaluation.rank)) {
          await manager.query(
            `
              INSERT INTO rank_maintenance_cycles
                (user_id, rank, cycle_start, cycle_end, required_gifts, required_referrals, policy_version)
              -- Ép kiểu timestamptz là BẮT BUỘC: cùng một tham số vừa làm giá trị cột
              -- vừa làm toán hạng cộng interval thì Postgres không suy được kiểu
              -- (42P08). Đoạn này chưa từng chạy thật nên lỗi nằm im từ đầu.
              SELECT $1, $2, $3::timestamptz, $3::timestamptz + interval '3 months',
                     maintenance_gifts, maintenance_referrals, version
              FROM rank_tiers WHERE rank = $2
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
          SELECT user_account.rank, balance.lifetime AS lifetime_points
          FROM users user_account
          LEFT JOIN user_point_balances balance ON balance.user_id = user_account.global_id
          WHERE user_account.global_id = $1
          FOR UPDATE OF user_account
        `,
        [userId],
      );

      if (!user) throw new UserNotFoundException();
      if (user.rank !== UserRanks.VIEWER) return false;

      // `AND rank = $3` là một phép so-rồi-đổi: nếu ai đó vừa đổi hạng xen
      // vào giữa thì câu này không khớp dòng nào và KHÔNG được ghi
      // `rank_transitions`, nếu không lịch sử hạng sẽ có bản ghi cho một lần
      // thăng hạng chưa từng xảy ra.
      const promoted = await updateReturning<{ global_id: string }>(
        manager,
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
            (user_id, from_rank, to_rank, reason, points_at_transition, actor)
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
          user_account.rank,
          balance.lifetime AS lifetime_points,
          balance.balance AS balance_points,
          current_tier.threshold_points,
          current_tier.warning_points,
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
        FROM users user_account
        LEFT JOIN user_point_balances balance ON balance.user_id = user_account.global_id
        LEFT JOIN rank_tiers current_tier ON current_tier.rank = user_account.rank
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::text AS qualified_referrals
          FROM referrals referral
          WHERE referral.referrer_id = user_account.global_id
            AND referral.qualified_at IS NOT NULL
        ) qualified_referrals
        LEFT JOIN LATERAL (
          SELECT rank, cycle_start, cycle_end, gifts_done, referrals_done, status
          FROM rank_maintenance_cycles
          WHERE user_id = user_account.global_id
            AND status IN ('OPEN', 'UNEVALUATED')
          ORDER BY cycle_start DESC
          LIMIT 1
        ) maintenance ON user_account.rank IN ('SILVER', 'GOLD', 'DIAMOND')
        WHERE user_account.global_id = $1
      `,
      [userId],
    );

    if (!summary) throw new UserNotFoundException();

    const currentTier = this.mapRequiredTier(summary);
    const nextRank = this.getNextRank(summary.rank);
    const nextTier = nextRank ? await this.getTier(nextRank) : null;

    // Cả hai con số vẫn trả về nguyên vẹn — chúng là hai sự thật khác nhau và màn
    // hình hồ sơ hiển thị cả hai. `rankPoints` chỉ nói CON SỐ NÀO đang cầm quyền,
    // đọc đúng cùng một cấu hình mà `reconcileNormalRank` đọc.
    const pointsColumn = await this.rankPointsColumn();
    const lifetimePoints = Number(summary.lifetime_points ?? 0);
    const balancePoints = Number(summary.balance_points ?? 0);

    return {
      rank: summary.rank,
      lifetimePoints,
      balancePoints,
      rankPoints: pointsColumn === 'lifetime' ? lifetimePoints : balancePoints,
      rankPointsSource: pointsColumn === 'lifetime' ? 'LIFETIME' : 'BALANCE',
      currentTier,
      nextTier,
      qualifiedReferrals: Number(summary.qualified_referrals),
      maintenanceCycle: this.mapMaintenanceCycle(summary),
    };
  }

  private async getTier(rank: UserRanks): Promise<IRankTierSummary> {
    const [tier] = await this.manager.query<IRawRankTierRow[]>(
      `
        SELECT rank, threshold_points, warning_points, required_gifts,
               required_referrals, post_quota
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
      warningPoints: Number(summary.warning_points ?? 0),
      requiredGifts: Number(summary.required_gifts),
      requiredReferrals: Number(summary.required_referrals),
      postQuota: Number(summary.post_quota),
    };
  }

  private mapTier(tier: IRawRankTierRow): IRankTierSummary {
    return {
      rank: tier.rank,
      thresholdPoints: Number(tier.threshold_points),
      warningPoints: Number(tier.warning_points),
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
