import { IReferralRepository } from '@/domain/ports/repository';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { PointLedgerRepository } from './point-ledger.repository';

@Injectable()
export class ReferralRepository implements IReferralRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly ledger: PointLedgerRepository,
  ) {}

  public async qualifyAndAward(params: {
    refereeId: string;
  }): Promise<boolean> {
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
      if (!referral) return false;

      const award = await this.ledger.appendByRuleWithinTransaction(manager, {
        userId: referral.referrer_id,
        ruleCode: 'REFERRAL_QUALIFIED',
        referenceType: 'REFERRAL',
        referenceId: params.refereeId,
        idempotencyKey: `REFERRAL_QUALIFIED:${params.refereeId}`,
        actor: 'SYSTEM',
        source: 'REFERRAL',
      });

      const [{ id }] = await manager.query<{ id: string }[]>(
        `
          UPDATE referrals
          SET qualified_at = now(), reward_entry_id = $2
          WHERE referee_id = $1
            AND qualified_at IS NULL
          RETURNING id
        `,
        [params.refereeId, award.entryId],
      );
      if (!id) return false;

      return true;
    });
  }
}
