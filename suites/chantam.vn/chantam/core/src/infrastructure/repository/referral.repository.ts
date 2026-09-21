import {
  IPointLedgerRepository,
  IReferralQualificationResult,
  IReferralRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

@Injectable()
export class ReferralRepository implements IReferralRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  public async getOwnSummary(userId: string) {
    const [summary] = await this.manager.query<
      {
        code: string;
        total_count: string;
        qualified_count: string;
        rewarded_count: string;
      }[]
    >(
      `
        SELECT
          user_account.referral_code AS code,
          COUNT(referral.id)::text AS total_count,
          COUNT(referral.qualified_at)::text AS qualified_count,
          COUNT(referral.reward_entry_id)::text AS rewarded_count
        FROM users user_account
        LEFT JOIN referrals referral ON referral.referrer_id = user_account.global_id
        WHERE user_account.global_id = $1
        GROUP BY user_account.referral_code
      `,
      [userId],
    );

    if (!summary) {
      return {
        code: '',
        totalCount: 0,
        qualifiedCount: 0,
        rewardedCount: 0,
      };
    }

    return {
      code: summary.code ?? '',
      totalCount: Number(summary.total_count),
      qualifiedCount: Number(summary.qualified_count),
      rewardedCount: Number(summary.rewarded_count),
    };
  }

  public async qualifyAndAward(params: {
    refereeId: string;
  }): Promise<IReferralQualificationResult> {
    return this.manager.transaction(async (manager) => {
      const [referral] = await manager.query<{ referrer_id: string }[]>(
        `
          SELECT referrer_id
          FROM referrals
          WHERE referee_id = $1
            AND qualified_at IS NULL
          FOR UPDATE
        `,
        [params.refereeId],
      );
      if (!referral) return { qualified: false };

      const award = await this.ledger.appendByRuleWithinTransaction(manager, {
        userId: referral.referrer_id,
        ruleCode: 'REFERRAL_QUALIFIED',
        referenceType: 'REFERRAL',
        referenceId: params.refereeId,
        idempotencyKey: `REFERRAL_QUALIFIED:${params.refereeId}`,
        actor: 'SYSTEM',
        source: 'REFERRAL',
      });

      // `AND qualified_at IS NULL` cho phép gọi lại mà không thưởng hai lần.
      // Đọc đúng số dòng khớp mới phân biệt được "vừa đủ điều kiện" với "đã
      // đủ điều kiện từ trước" — trả nhầm là bộ đếm giới thiệu sai theo.
      const qualified = await updateReturning<{ id: string }>(
        manager,
        `
          UPDATE referrals
          SET qualified_at = now(), reward_entry_id = $2
          WHERE referee_id = $1
            AND qualified_at IS NULL
          RETURNING id
        `,
        [params.refereeId, award.entryId],
      );
      if (qualified.length === 0) return { qualified: false };

      return { qualified: true, referrerId: referral.referrer_id };
    });
  }
}
