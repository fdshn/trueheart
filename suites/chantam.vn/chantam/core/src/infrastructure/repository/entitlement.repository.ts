import { IEntitlementRepository } from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IEntitlementDto,
  IEntitlementsSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { QuotaStatuses } from './post.repository';

interface IEntitlementRow {
  rank: UserRanks;
  revision_id: string;
  code: string;
  allowed: boolean;
  limit_value: string | null;
}

/** Chỉ quyền đăng bài mới rút từ rổ hạn mức bài đang mở. */
function isPostCapability(code: string): boolean {
  return code === 'POST_OFFER' || code === 'POST_WANTED';
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
    const openPosts = await this.countOpenPosts(userId);

    return {
      rank: firstRow?.rank ?? UserRanks.VIEWER,
      policyRevisionId: Number(firstRow?.revision_id ?? 0),
      capabilities: rows.map((row) => {
        const limit = row.limit_value === null ? null : Number(row.limit_value);
        // Hạn mức đăng bài dùng CHUNG một rổ bài đang mở: `createPostWithinQuota`
        // đếm mọi loại bài, không tách OFFER với WANTED. Các quyền khác chưa có
        // khái niệm "đã dùng" nên để 0 thay vì bịa ra một con số.
        const used = isPostCapability(row.code) ? openPosts : 0;

        return {
          code: row.code,
          allowed: row.allowed,
          limit,
          used,
          remaining: limit === null ? null : Math.max(0, limit - used),
          reasonCode: row.allowed ? null : 'RANK_REQUIREMENT_NOT_MET',
        };
      }),
    };
  }

  private async countOpenPosts(userId: string): Promise<number> {
    const [row] = await this.manager.query<{ open_posts: string }[]>(
      `
        SELECT COUNT(*)::text AS open_posts
        FROM posts
        WHERE author_id = $1
          AND deleted_at IS NULL
          AND status IN (${QuotaStatuses.map((status) => `'${status}'`).join(', ')})
      `,
      [userId],
    );

    return Number(row?.open_posts ?? 0);
  }

  public async getCapability(
    userId: string,
    code: string,
  ): Promise<IEntitlementDto | null> {
    const summary = await this.getOwnEntitlements(userId);
    return (
      summary.capabilities.find((capability) => capability.code === code) ??
      null
    );
  }
}
