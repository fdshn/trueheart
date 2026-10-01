import {
  EntitlementCapabilityUnknownException,
  EntitlementLimitInvalidException,
  EntitlementPolicyUnavailableException,
} from '@/domain/exceptions';
import {
  IEntitlementPolicyCapabilityPatch,
  IEntitlementRepository,
  IGiftRequestRepository,
  IPublishEntitlementPolicyCommand,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IEntitlementDto,
  IEntitlementPolicyCapabilityDto,
  IEntitlementPolicyHistoryEntryDto,
  IEntitlementPolicyRevisionDto,
  IEntitlementsSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  capabilityKindOf,
  CapabilityKinds,
  resolveQuotaLimit,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
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

/**
 * Bộ đếm "đã dùng" cho từng capability `QUOTA`.
 *
 * ## Vì sao là một BẢNG, không phải một `if`
 *
 * Bản trước 01/10 là `isPostCapability(code) ? openPosts : 0` — một hàm chỉ biết đúng
 * một mã, và mọi mã khác nhận `0`. `OPEN_REQUEST_QUOTA` vì thế báo `used: 0` cho người
 * đang có 5/5 yêu cầu mở, trong khi server từ chối đúng lúc đó. Một bảng thì thêm
 * capability là thêm một dòng ở đây, còn `test:entitlement-inventory` canh để không ai
 * seed một `QUOTA` mới mà quên bộ đếm.
 *
 * ## Vì sao gọi sang repository khác thay vì chép câu SQL
 *
 * `countOpenByRequester` có hẳn một lý lẽ riêng trong nó về việc JOIN sang `posts` và
 * về việc `STANDBY` vẫn tính. Chép câu đó sang đây là tạo bản thứ hai sẽ lệch ở lần sửa
 * sau — và khi lệch thì con số app thấy lại khác con số server chặn theo, tức đúng cái
 * lỗi đang được sửa, ở một chỗ mới.
 */
type UsageCounter = (userId: string) => Promise<number>;

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

  assertLimitsUsable(capabilities);

  return { ...current, capabilities };
}

/**
 * Hạn mức của mỗi ô phải DÙNG ĐƯỢC, không chỉ hợp kiểu.
 *
 * ## Vì sao cần, và vì sao kiểm SAU khi áp patch
 *
 * `§24.5` của tài liệu từng vẽ một bước *"value hợp kiểu đã khai chưa?"*. Bước đó chưa
 * bao giờ tồn tại: đường ghi chỉ kiểm mã capability có thật, không kiểm giá trị. Mà
 * capability lại không có cột `value_type` nào để mà hợp kiểu.
 *
 * Kiểm sau khi áp patch chứ không kiểm trên payload: Admin gửi `allowed: true` mà không
 * nhắc `limit` thì ô đó lấy `limit` CŨ, và chỉ bản đã ghép mới nói được trạng thái cuối
 * cùng có dùng được hay không.
 *
 * ## Hai ca bị chặn
 *
 * Cả hai đều là TỰ MÂU THUẪN, không phải một lựa chọn chính sách:
 *
 * 1. `QUOTA` + `allowed: true` + `limit` là `null`. Ghi chú DTO từng nói `null` nghĩa là
 *    "không giới hạn", trong khi `create-post` và `create-gift-request` đều đọc
 *    `limit ?? 0` — tức Admin xoá trống ô định MỞ khoá thì thực tế là KHOÁ SẠCH cả bậc
 *    đó, và người dùng nhận thông báo "quota 0" không nói gì về cấu hình. Giữ lối
 *    fail-closed ở tầng đọc, và chặn việc tạo ra ô trống đó ở đây.
 * 2. `QUOTA` + `allowed: true` + `limit: 0`. "Cho phép nhưng hạn mức không" là hai câu
 *    đánh nhau; muốn cấm thì đặt `allowed: false`, đúng cách VIEWER đang được seed.
 *
 * `GATE` thì KHÔNG kiểm `limit`: dữ liệu seed có `COMMENT_CONTENT` bậc VIEWER mang
 * `limit = 0` một cách vô hại, và bắt lỗi nó là ép Admin dọn một con số không ai đọc.
 */
function assertLimitsUsable(
  capabilities: IEntitlementPolicyCapabilityDto[],
): void {
  for (const capability of capabilities) {
    if (capabilityKindOf(capability.code) !== CapabilityKinds.QUOTA) continue;

    for (const rankValue of capability.ranks) {
      if (!rankValue.allowed) continue;
      if (rankValue.limit === null)
        throw new EntitlementLimitInvalidException(
          capability.code,
          rankValue.rank,
          'đã cho phép thì phải có hạn mức — ô trống bị đọc thành 0 nên sẽ khoá cả bậc này',
        );
      if (rankValue.limit <= 0)
        throw new EntitlementLimitInvalidException(
          capability.code,
          rankValue.rank,
          'cho phép nhưng hạn mức 0 là hai câu đánh nhau — muốn cấm thì đặt allowed = false',
        );
    }
  }
}

@Injectable()
export class EntitlementRepository implements IEntitlementRepository {
  private readonly usageCounters: Readonly<Record<string, UsageCounter>>;

  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    // Repository gọi repository cùng tầng hạ tầng — cùng lối mà `GiftRequestRepository`
    // gọi `IChatRepository`, và là cách duy nhất giữ ĐÚNG MỘT nguồn cho phép đếm.
    @Inject(IGiftRequestRepository)
    private readonly giftRequests: IGiftRequestRepository,
  ) {
    this.usageCounters = {
      POST_OPEN: (userId) => this.countOpenPosts(userId),
      OPEN_REQUEST_QUOTA: (userId) =>
        this.giftRequests.countOpenByRequester(userId),
    };
  }

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

    // Đếm MỘT lượt cho mỗi capability có bộ đếm, song song. Không đếm cho loại
    // không cần: một trang Admin không nên kéo chín lượt đếm để trả bảy số `null`.
    const counted = await Promise.all(
      rows
        .filter((row) => this.usageCounters[row.code] !== undefined)
        .map(async (row) => {
          const count = await this.usageCounters[row.code](userId);
          return [row.code, count] as const;
        }),
    );
    const usedByCode = new Map<string, number>(counted);

    return {
      rank: firstRow?.rank ?? UserRanks.VIEWER,
      policyRevisionId: Number(firstRow?.revision_id ?? 0),
      capabilities: rows.map((row) => {
        const kind = capabilityKindOf(row.code);
        const quota = kind === CapabilityKinds.QUOTA;
        // `GATE` không mang con số nào; `VALUE` mang `limit` nhưng không tiêu dần.
        const limit =
          kind === CapabilityKinds.GATE || row.limit_value === null
            ? null
            : Number(row.limit_value);
        const used = quota ? (usedByCode.get(row.code) ?? 0) : null;

        return {
          code: row.code,
          kind,
          allowed: row.allowed,
          limit,
          used,
          // Chỉ `QUOTA` mới có "còn lại". Trước 01/10 `DISCOVERY_RADIUS` trả
          // `remaining: 10000` — "còn lại 10 km" không nói lên gì.
          remaining:
            quota && used !== null
              ? Math.max(0, resolveQuotaLimit(limit) - used)
              : null,
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

  /**
   * Lịch sử các bản chính sách, mới nhất trước.
   *
   * Đếm capability bằng một truy vấn con thay vì JOIN rồi gom ở TypeScript: một bản có
   * chín capability × năm bậc là bốn mươi lăm dòng, và ở đây chỉ cần một con số.
   */
  public async listPolicyHistory(
    limit: number,
  ): Promise<IEntitlementPolicyHistoryEntryDto[]> {
    const rows = await this.manager.query<
      {
        revision_id: string;
        status: string;
        effective_from: Date;
        effective_to: Date | null;
        change_reason: string | null;
        capability_count: string;
      }[]
    >(
      `
        SELECT
          revision.id AS revision_id,
          revision.status,
          revision.effective_from,
          revision.effective_to,
          revision.change_reason,
          (
            SELECT count(*) FROM capability_policies policy
            WHERE policy.revision_id = revision.id
          )::text AS capability_count
        FROM config_revisions revision
        WHERE revision.scope = 'ENTITLEMENT'
        ORDER BY revision.id DESC
        LIMIT $1
      `,
      [limit],
    );

    return rows.map((row) => ({
      revisionId: Number(row.revision_id),
      status: row.status,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      changeReason: row.change_reason,
      capabilityCount: Number(row.capability_count),
    }));
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
      //
      // ĐẶT CẢ `status = 'ARCHIVED'`, không chỉ `effective_to`. Bản trước 01/10 đóng khung
      // thời gian mà giữ nguyên `PUBLISHED`, nên sau N lượt publish có N dòng đều mang
      // `PUBLISHED` và chỉ phân biệt được bằng khung thời gian. Các đường đọc vẫn đúng vì
      // chúng lọc cả khung, nhưng cột `status` thì nói sai — và `GET /admin/entitlements/history`
      // trả chính cột đó ra cho Admin đọc.
      //
      // `system_configs` — cơ chế sinh đôi của bảng này — dùng `ARCHIVED` đúng như vậy.
      // Chuyển sang ARCHIVED cũng đưa dòng cũ ra khỏi ràng buộc GIST (nó chỉ áp cho
      // `status = 'PUBLISHED'`), tức an toàn hơn chứ không kém đi.
      await manager.query(
        `UPDATE config_revisions
         SET effective_to = $2, status = 'ARCHIVED'
         WHERE id = $1`,
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
