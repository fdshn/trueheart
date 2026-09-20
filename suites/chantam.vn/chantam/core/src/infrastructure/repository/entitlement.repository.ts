import {
  EntitlementCapabilityUnknownException,
  EntitlementPolicyUnavailableException,
} from '@/domain/exceptions';
import {
  IEntitlementPolicyCapabilityPatch,
  IEntitlementRepository,
  IPublishEntitlementPolicyCommand,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IEntitlementDto,
  IEntitlementPolicyCapabilityDto,
  IEntitlementPolicyRevisionDto,
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

interface IPolicyRow {
  revision_id: string;
  effective_from: Date;
  change_reason: string | null;
  code: string;
  enabled: boolean;
  rank: UserRanks;
  allowed: boolean;
  limit_value: string | null;
}

const PolicySelect = `
  SELECT
    revision.id AS revision_id,
    revision.effective_from,
    revision.change_reason,
    policy.code,
    policy.enabled,
    rank_value.rank,
    rank_value.allowed,
    rank_value.limit_value
  FROM config_revisions revision
  INNER JOIN capability_policies policy
    ON policy.revision_id = revision.id
  INNER JOIN capability_rank_values rank_value
    ON rank_value.policy_id = policy.id
  WHERE revision.scope = 'ENTITLEMENT'
    AND revision.status = 'PUBLISHED'
    AND revision.effective_from <= now()
    AND (revision.effective_to IS NULL OR revision.effective_to > now())
  ORDER BY policy.code ASC, rank_value.rank ASC
`;

/**
 * Gom các dòng phẳng thành bảng capability × rank.
 *
 * Thứ tự rank giữ nguyên theo `users_rank_enum`, tức từ thấp lên cao, nên phía
 * admin hiển thị được luôn mà không phải sắp lại.
 */
function toRevision(rows: IPolicyRow[]): IEntitlementPolicyRevisionDto {
  if (rows.length === 0) throw new EntitlementPolicyUnavailableException();

  const capabilities = new Map<string, IEntitlementPolicyCapabilityDto>();

  for (const row of rows) {
    const capability = capabilities.get(row.code) ?? {
      code: row.code,
      enabled: row.enabled,
      ranks: [],
    };

    capability.ranks.push({
      rank: row.rank,
      allowed: row.allowed,
      limit: row.limit_value === null ? null : Number(row.limit_value),
    });
    capabilities.set(row.code, capability);
  }

  return {
    revisionId: Number(rows[0].revision_id),
    effectiveFrom: rows[0].effective_from,
    changeReason: rows[0].change_reason,
    capabilities: [...capabilities.values()],
  };
}

/** Chỉ quyền đăng bài mới rút từ rổ hạn mức bài đang mở. */
function isPostCapability(code: string): boolean {
  return code === 'POST_OFFER' || code === 'POST_WANTED';
}

/**
 * Áp các ô cần đổi lên bản hiện hành, giữ nguyên mọi thứ không nhắc tới.
 *
 * Bỏ trống `allowed`/`limit` là GIỮ NGUYÊN chứ không phải đặt về false/null:
 * admin sửa quota Gold thì không được lặng lẽ khoá quyền của Kim Cương. Đây
 * cũng là lý do bản mới dựng từ bản cũ thay vì từ payload gửi lên.
 */
function applyPatches(
  current: IEntitlementPolicyRevisionDto,
  patches: IEntitlementPolicyCapabilityPatch[],
): IEntitlementPolicyRevisionDto {
  const capabilities = current.capabilities.map((capability) => ({
    ...capability,
    ranks: capability.ranks.map((rankValue) => ({ ...rankValue })),
  }));

  for (const patch of patches) {
    const capability = capabilities.find((item) => item.code === patch.code);

    // Gõ sai mã capability mà im lặng bỏ qua thì admin tưởng đã đổi xong, trong
    // khi thực tế không có gì thay đổi.
    if (!capability)
      throw new EntitlementCapabilityUnknownException(patch.code);

    if (patch.enabled !== undefined) capability.enabled = patch.enabled;

    for (const rankPatch of patch.ranks ?? []) {
      let rankValue = capability.ranks.find(
        (item) => item.rank === rankPatch.rank,
      );

      if (!rankValue) {
        rankValue = { rank: rankPatch.rank, allowed: false, limit: null };
        capability.ranks.push(rankValue);
      }

      if (rankPatch.allowed !== undefined)
        rankValue.allowed = rankPatch.allowed;
      if (rankPatch.limit !== undefined) rankValue.limit = rankPatch.limit;
    }
  }

  return { ...current, capabilities };
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

  public async getPolicyRevision(): Promise<IEntitlementPolicyRevisionDto> {
    return toRevision(await this.manager.query<IPolicyRow[]>(PolicySelect));
  }

  public async publishPolicyRevision(
    command: IPublishEntitlementPolicyCommand,
  ): Promise<IEntitlementPolicyRevisionDto> {
    return this.manager.transaction(async (manager) => {
      // Khoá bản đang hiệu lực trước khi đọc: hai admin bấm lưu cùng lúc mà
      // không khoá thì người sau đọc bản cũ, và thay đổi của người trước biến
      // mất không dấu vết.
      const [locked] = await manager.query<{ id: string; bundle_id: string }[]>(
        `
          SELECT id, bundle_id
          FROM config_revisions
          WHERE scope = 'ENTITLEMENT'
            AND status = 'PUBLISHED'
            AND effective_from <= now()
            AND (effective_to IS NULL OR effective_to > now())
          FOR UPDATE
        `,
      );

      if (!locked) throw new EntitlementPolicyUnavailableException();

      const current = toRevision(
        await manager.query<IPolicyRow[]>(PolicySelect),
      );
      const next = applyPatches(current, command.capabilities);
      const now = new Date();

      // Đóng bản cũ TRƯỚC khi mở bản mới. Ràng buộc GIST cấm hai bản PUBLISHED
      // cùng scope trùng khung thời gian, nên đảo thứ tự là insert bị từ chối.
      await manager.query(
        `UPDATE config_revisions SET effective_to = $2 WHERE id = $1`,
        [locked.id, now],
      );

      const [revision] = await manager.query<
        { id: string; effective_from: Date }[]
      >(
        `
          INSERT INTO config_revisions
            (bundle_id, scope, status, effective_from, change_reason)
          VALUES ($1, 'ENTITLEMENT', 'PUBLISHED', $2, $3)
          RETURNING id, effective_from
        `,
        [locked.bundle_id, now, command.changeReason],
      );

      for (const capability of next.capabilities) {
        const [policy] = await manager.query<{ id: string }[]>(
          `
            INSERT INTO capability_policies (revision_id, code, enabled)
            VALUES ($1, $2, $3)
            RETURNING id
          `,
          [revision.id, capability.code, capability.enabled],
        );

        for (const rankValue of capability.ranks)
          await manager.query(
            `
              INSERT INTO capability_rank_values
                (policy_id, rank, allowed, limit_value)
              VALUES ($1, $2::users_rank_enum, $3, $4)
            `,
            [policy.id, rankValue.rank, rankValue.allowed, rankValue.limit],
          );
      }

      await manager.query(
        `
          INSERT INTO admin_audit_logs
            (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
          VALUES ($1, 'PUBLISH', 'ENTITLEMENT_POLICY', $2, $3::jsonb, $4::jsonb, $5)
        `,
        [
          command.actorUserId,
          String(revision.id),
          JSON.stringify(current.capabilities),
          JSON.stringify(next.capabilities),
          command.changeReason,
        ],
      );

      return {
        revisionId: Number(revision.id),
        effectiveFrom: revision.effective_from,
        changeReason: command.changeReason,
        capabilities: next.capabilities,
      };
    });
  }
}
