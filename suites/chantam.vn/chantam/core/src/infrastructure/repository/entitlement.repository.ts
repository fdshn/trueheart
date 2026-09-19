import { IEntitlementRepository } from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { IEntitlementsSummaryDto } from '@chantam.vn/chantam.core-lib/dto';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IEntitlementRow {
  rank: UserRanks;
  revision_id: string;
  code: string;
  allowed: boolean;
  limit_value: string | null;
}

@Injectable()
export class EntitlementRepository implements IEntitlementRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async getOwnEntitlements(
    userId: string,
  ): Promise<IEntitlementsSummaryDto> {
    const rows = await this.manager.query<IEntitlementRow[]>(
      `
        SELECT
          user_account.rank,
          revision.id AS revision_id,
          policy.code,
          (policy.enabled AND rank_value.allowed) AS allowed,
          rank_value.limit_value
        FROM users user_account
        INNER JOIN config_revisions revision
          ON revision.scope = 'ENTITLEMENT'
         AND revision.status = 'PUBLISHED'
         AND revision.effective_from <= now()
         AND (revision.effective_to IS NULL OR revision.effective_to > now())
        INNER JOIN capability_policies policy
          ON policy.revision_id = revision.id
        INNER JOIN capability_rank_values rank_value
          ON rank_value.policy_id = policy.id
         AND rank_value.rank = user_account.rank
        WHERE user_account.global_id = $1
        ORDER BY policy.code ASC
      `,
      [userId],
    );

    const firstRow = rows[0];
    return {
      rank: firstRow?.rank ?? UserRanks.VIEWER,
      policyRevisionId: Number(firstRow?.revision_id ?? 0),
      capabilities: rows.map((row) => {
        const limit = row.limit_value === null ? null : Number(row.limit_value);
        return {
          code: row.code,
          allowed: row.allowed,
          limit,
          used: 0,
          remaining: limit,
          reasonCode: row.allowed ? null : 'RANK_REQUIREMENT_NOT_MET',
        };
      }),
    };
  }
}
