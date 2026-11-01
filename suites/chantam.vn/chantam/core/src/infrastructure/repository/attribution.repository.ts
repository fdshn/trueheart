import {
  ClaimAttributionOutcome,
  IAttributionClaimRow,
  IAttributionClickContext,
  IAttributionLink,
  IAttributionLinkWithReferrer,
  IAttributionRepository,
  ReviewAttributionClaimOutcome,
} from '@/domain/ports/repository';
import {
  AttributionPlatforms,
  AttributionRiskStatuses,
  AttributionTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { randomInt, randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

/** Bỏ ký tự dễ đọc nhầm (0/O, 1/I/L) — mã này nằm trong URL người ta gõ lại được. */
const CodeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CodeLength = 10;

function newLinkCode(): string {
  let code = '';
  for (let index = 0; index < CodeLength; index += 1)
    code += CodeAlphabet[randomInt(CodeAlphabet.length)];
  return code;
}

interface ILinkRow {
  id: string;
  code: string;
  referrer_id: string;
  target_type: AttributionTargetTypes | null;
  target_value: string | null;
  campaign: string | null;
  source: string | null;
  medium: string | null;
  created_at: Date;
  revoked_at: Date | null;
}

interface ILinkWithReferrerRow extends ILinkRow {
  referrer_username: string;
  referrer_full_name: string | null;
  referrer_avatar_url: string | null;
  referrer_referral_code: string | null;
  referrer_active: boolean;
}

const LinkColumns = `
  link.id::text AS id, link.code, link.referrer_id, link.target_type, link.target_value,
  link.campaign, link.source, link.medium, link.created_at, link.revoked_at`;

const ReferrerColumns = `
  referrer.username AS referrer_username, referrer.full_name AS referrer_full_name,
  referrer.avatar_url AS referrer_avatar_url, referrer.referral_code AS referrer_referral_code,
  (referrer.status = 'ACTIVE' AND referrer.deleted_at IS NULL) AS referrer_active`;

const toLink = (row: ILinkRow): IAttributionLink => ({
  id: row.id,
  code: row.code,
  referrerId: row.referrer_id,
  targetType: row.target_type,
  targetValue: row.target_value,
  campaign: row.campaign,
  source: row.source,
  medium: row.medium,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
});

const toLinkWithReferrer = (
  row: ILinkWithReferrerRow,
): IAttributionLinkWithReferrer => ({
  ...toLink(row),
  referrer: {
    username: row.referrer_username,
    fullName: row.referrer_full_name,
    avatarUrl: row.referrer_avatar_url,
    referralCode: row.referrer_referral_code,
    active: row.referrer_active,
  },
});

interface IClaimRow {
  claim_id: string;
  risk_status: AttributionRiskStatuses;
  risk_reason: string | null;
  referrer_user_id: string;
  referrer_username: string;
  referred_user_id: string;
  referred_username: string;
  link_code: string;
  campaign: string | null;
  platform: AttributionPlatforms;
  claimed_at: Date;
  reviewed_at: Date | null;
  referral_qualified_at: Date | null;
}

const ClaimSelect = `
  SELECT claim.global_id AS claim_id, claim.risk_status, claim.risk_reason,
         claim.referrer_id AS referrer_user_id, referrer.username AS referrer_username,
         claim.referred_user_id, referred.username AS referred_username,
         link.code AS link_code, link.campaign, resolution.platform,
         claim.claimed_at, claim.reviewed_at, invite.qualified_at AS referral_qualified_at
  FROM attribution_claims claim
  JOIN attribution_clicks click ON click.global_id = claim.click_id
  JOIN attribution_links link ON link.id = click.link_id
  JOIN attribution_resolutions resolution ON resolution.id = claim.resolution_id
  JOIN users referrer ON referrer.global_id = claim.referrer_id
  JOIN users referred ON referred.global_id = claim.referred_user_id
  LEFT JOIN referrals invite ON invite.id = claim.referral_id`;

const toClaim = (row: IClaimRow): IAttributionClaimRow => ({
  claimId: row.claim_id,
  riskStatus: row.risk_status,
  riskReason: row.risk_reason,
  referrerUserId: row.referrer_user_id,
  referrerUsername: row.referrer_username,
  referredUserId: row.referred_user_id,
  referredUsername: row.referred_username,
  linkCode: row.link_code,
  campaign: row.campaign,
  platform: row.platform,
  claimedAt: row.claimed_at,
  reviewedAt: row.reviewed_at,
  referralQualifiedAt: row.referral_qualified_at,
});

@Injectable()
export class AttributionRepository implements IAttributionRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async targetExists(
    type: AttributionTargetTypes,
    value: string,
  ): Promise<boolean> {
    const sql: Record<AttributionTargetTypes, string> = {
      // Cùng ngưỡng với `GET /posts/share/:shareCode`: chỉ bài Admin gỡ (`REJECTED`) là không mở.
      [AttributionTargetTypes.POST]: `SELECT 1 FROM posts WHERE share_code = $1 AND deleted_at IS NULL AND status <> 'REJECTED'`,
      [AttributionTargetTypes.PROFILE]: `SELECT 1 FROM users WHERE username = $1 AND status = 'ACTIVE' AND deleted_at IS NULL`,
      [AttributionTargetTypes.USER]: `SELECT 1 FROM users WHERE username = $1 AND status = 'ACTIVE' AND deleted_at IS NULL`,
      [AttributionTargetTypes.GROUP_INVITE]: `SELECT 1 FROM groups WHERE invite_code = $1 AND status = 'ACTIVE' AND deleted_at IS NULL`,
    };
    const rows = await this.manager.query<unknown[]>(sql[type], [value]);
    return rows.length > 0;
  }

  public async findOrCreateLink(params: {
    referrerId: string;
    targetType: AttributionTargetTypes | null;
    targetValue: string | null;
    campaign: string | null;
    source: string | null;
    medium: string | null;
  }): Promise<{ link: IAttributionLink; created: boolean }> {
    const values = [
      params.referrerId,
      params.targetType ?? '',
      params.targetValue ?? '',
      params.campaign ?? '',
      params.source ?? '',
      params.medium ?? '',
    ];
    const findLive = async () => {
      const [row] = await this.manager.query<ILinkRow[]>(
        `
          SELECT ${LinkColumns} FROM attribution_links link
          WHERE link.referrer_id = $1 AND link.revoked_at IS NULL
            AND COALESCE(link.target_type, '') = $2 AND COALESCE(link.target_value, '') = $3
            AND COALESCE(link.campaign, '') = $4 AND COALESCE(link.source, '') = $5
            AND COALESCE(link.medium, '') = $6
        `,
        values,
      );
      return row ? toLink(row) : null;
    };

    const existing = await findLive();
    if (existing) return { link: existing, created: false };

    // Ba lượt: va chạm mã ngẫu nhiên (31^10) gần như không xảy ra, còn va chạm với lượt
    // tạo SONG SONG của chính người đó thì lượt sau đọc lại link của lượt trước.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [row] = await this.manager.query<ILinkRow[]>(
        `
          INSERT INTO attribution_links AS link
            (code, referrer_id, target_type, target_value, campaign, source, medium)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT DO NOTHING
          RETURNING ${LinkColumns}
        `,
        [
          newLinkCode(),
          params.referrerId,
          params.targetType,
          params.targetValue,
          params.campaign,
          params.source,
          params.medium,
        ],
      );
      if (row) return { link: toLink(row), created: true };
      const raced = await findLive();
      if (raced) return { link: raced, created: false };
    }
    throw new Error('Không tạo được mã link giới thiệu sau ba lượt');
  }

  public async findLinkByCode(
    code: string,
  ): Promise<IAttributionLinkWithReferrer | null> {
    const [row] = await this.manager.query<ILinkWithReferrerRow[]>(
      `
        SELECT ${LinkColumns}, ${ReferrerColumns}
        FROM attribution_links link
        JOIN users referrer ON referrer.global_id = link.referrer_id
        WHERE link.code = $1
      `,
      [code],
    );
    return row ? toLinkWithReferrer(row) : null;
  }

  public async createClick(params: {
    clickId: string;
    linkId: string;
    tokenJti: string;
    issuedAt: Date;
    expiresAt: Date;
    ipHash: string | null;
    userAgentHash: string | null;
  }): Promise<void> {
    await this.manager.query(
      `
        INSERT INTO attribution_clicks
          (global_id, link_id, token_jti, issued_at, expires_at, ip_hash, user_agent_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        params.clickId,
        params.linkId,
        params.tokenJti,
        params.issuedAt,
        params.expiresAt,
        params.ipHash,
        params.userAgentHash,
      ],
    );
  }

  public async findClickByTokenJti(
    jti: string,
  ): Promise<IAttributionClickContext | null> {
    const [row] = await this.manager.query<
      (ILinkWithReferrerRow & { click_id: string; expires_at: Date })[]
    >(
      `
        SELECT click.global_id AS click_id, click.expires_at,
               ${LinkColumns}, ${ReferrerColumns}
        FROM attribution_clicks click
        JOIN attribution_links link ON link.id = click.link_id
        JOIN users referrer ON referrer.global_id = link.referrer_id
        WHERE click.token_jti = $1
      `,
      [jti],
    );
    return row
      ? {
          clickId: row.click_id,
          expiresAt: row.expires_at,
          link: toLinkWithReferrer(row),
        }
      : null;
  }

  public async upsertResolution(params: {
    clickId: string;
    installIdHash: string;
    platform: AttributionPlatforms;
    ipHash: string | null;
    newClaimJti: string;
    newClaimExpiresAt: Date;
  }): Promise<{ claimJti: string; claimExpiresAt: Date; issuedAt: Date }> {
    // INSERT … ON CONFLICT DO UPDATE trả về đúng một dòng (INSERT không bị TypeORM bọc).
    // Claim jti cũ còn hạn thì GIỮ — cùng (lượt mở, bản cài) ra cùng claim token.
    const [row] = await this.manager.query<
      { claim_jti: string; claim_expires_at: Date; issued_at: Date }[]
    >(
      `
        INSERT INTO attribution_resolutions AS resolution
          (click_id, install_id_hash, platform, claim_jti, claim_expires_at, ip_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (click_id, install_id_hash) DO UPDATE SET
          last_resolved_at = now(),
          resolve_count = resolution.resolve_count + 1,
          claim_jti = CASE WHEN resolution.claim_expires_at <= now()
                           THEN EXCLUDED.claim_jti ELSE resolution.claim_jti END,
          resolved_at = CASE WHEN resolution.claim_expires_at <= now()
                             THEN now() ELSE resolution.resolved_at END,
          claim_expires_at = CASE WHEN resolution.claim_expires_at <= now()
                                  THEN EXCLUDED.claim_expires_at
                                  ELSE resolution.claim_expires_at END
        RETURNING claim_jti, claim_expires_at, resolved_at AS issued_at
      `,
      [
        params.clickId,
        params.installIdHash,
        params.platform,
        params.newClaimJti,
        params.newClaimExpiresAt,
        params.ipHash,
      ],
    );
    return {
      claimJti: row.claim_jti,
      claimExpiresAt: row.claim_expires_at,
      issuedAt: row.issued_at,
    };
  }

  public async claim(params: {
    claimJti: string;
    userId: string;
    tokenExpired: boolean;
    ipHash: string | null;
    maxAccountAgeDays: number;
    installReuseWindowDays: number;
  }): Promise<ClaimAttributionOutcome> {
    return this.manager.transaction(async (manager) => {
      // Khoá LƯỢT MỞ trước: hai tài khoản claim cùng token thì người sau chờ, rồi thấy dòng
      // claim của người trước.
      const [context] = await manager.query<
        {
          resolution_id: string;
          click_id: string;
          install_id_hash: string;
          referrer_id: string;
          revoked: boolean;
          referrer_active: boolean;
          referrer_code: string | null;
        }[]
      >(
        `
          SELECT resolution.id::text AS resolution_id, click.global_id AS click_id,
                 resolution.install_id_hash, link.referrer_id,
                 link.revoked_at IS NOT NULL AS revoked,
                 (referrer.status = 'ACTIVE' AND referrer.deleted_at IS NULL) AS referrer_active,
                 referrer.referral_code AS referrer_code
          FROM attribution_resolutions resolution
          JOIN attribution_clicks click ON click.global_id = resolution.click_id
          JOIN attribution_links link ON link.id = click.link_id
          JOIN users referrer ON referrer.global_id = link.referrer_id
          WHERE resolution.claim_jti = $1
          FOR UPDATE OF click
        `,
        [params.claimJti],
      );
      if (!context) return { status: 'NOT_FOUND' };

      // Sau đó khoá NGƯỜI ĐƯỢC MỜI: một người claim hai link song song thì lượt sau thấy
      // lượt trước. Thứ tự khoá cố định (lượt mở → người) nên không thắt nút.
      const [user] = await manager.query<
        { eligible: boolean; active: boolean }[]
      >(
        `
          SELECT (rank = 'VIEWER'
                  AND created_at > now() - make_interval(days => $2)) AS eligible,
                 (status = 'ACTIVE' AND deleted_at IS NULL) AS active
          FROM users WHERE global_id = $1
          FOR UPDATE
        `,
        [params.userId, params.maxAccountAgeDays],
      );
      if (!user?.active) return { status: 'NOT_ELIGIBLE' };

      const [clickClaim] = await manager.query<
        { referred_user_id: string; risk_status: AttributionRiskStatuses }[]
      >(
        `SELECT referred_user_id, risk_status FROM attribution_claims WHERE click_id = $1`,
        [context.click_id],
      );
      if (clickClaim)
        return clickClaim.referred_user_id === params.userId
          ? {
              status: 'CLAIMED',
              riskStatus: clickClaim.risk_status,
              created: false,
            }
          : { status: 'ALREADY_CLAIMED' };

      // Từ đây là lượt claim MỚI — token hết hạn thì thôi.
      if (params.tokenExpired) return { status: 'EXPIRED' };
      if (context.revoked || !context.referrer_active)
        return { status: 'REVOKED' };
      if (context.referrer_id === params.userId)
        return { status: 'SELF_REFERRAL' };

      // Vòng: người này đã từng giới thiệu chính người đang giới thiệu họ.
      const [loop] = await manager.query<unknown[]>(
        `SELECT 1 FROM referrals WHERE referrer_id = $1 AND referee_id = $2`,
        [params.userId, context.referrer_id],
      );
      if (loop) return { status: 'SELF_REFERRAL' };

      const [ownClaim] = await manager.query<
        { referrer_id: string; risk_status: AttributionRiskStatuses }[]
      >(
        `SELECT referrer_id, risk_status FROM attribution_claims WHERE referred_user_id = $1`,
        [params.userId],
      );
      if (ownClaim)
        return ownClaim.referrer_id === context.referrer_id
          ? {
              status: 'CLAIMED',
              riskStatus: ownClaim.risk_status,
              created: false,
            }
          : { status: 'REFERRER_EXISTS' };

      // Đã có người giới thiệu từ lúc đăng ký (nhập mã). Cùng người thì ghi nhận lượt claim
      // trỏ vào đúng dòng đó; khác người thì từ chối — mỗi tài khoản một người giới thiệu.
      const [existingReferral] = await manager.query<
        { id: string; referrer_id: string }[]
      >(
        `SELECT id::text AS id, referrer_id FROM referrals WHERE referee_id = $1`,
        [params.userId],
      );
      if (
        existingReferral &&
        existingReferral.referrer_id !== context.referrer_id
      )
        return { status: 'REFERRER_EXISTS' };
      if (!existingReferral && !user.eligible)
        return { status: 'NOT_ELIGIBLE' };

      // Tín hiệu: cùng bản cài đã claim cho một tài khoản KHÁC gần đây — một máy đẻ nhiều
      // tài khoản. Không từ chối (máy dùng chung trong gia đình là chuyện thường), mà giữ
      // lại chờ Admin, CHƯA ghi quan hệ giới thiệu nên chưa có gì để thưởng.
      const [reused] = await manager.query<unknown[]>(
        `
          SELECT 1
          FROM attribution_claims other
          JOIN attribution_resolutions resolution ON resolution.id = other.resolution_id
          WHERE resolution.install_id_hash = $1
            AND other.referred_user_id <> $2
            AND other.claimed_at > now() - make_interval(days => $3)
          LIMIT 1
        `,
        [context.install_id_hash, params.userId, params.installReuseWindowDays],
      );
      const flagged = Boolean(reused) && !existingReferral;

      let referralId: string | null = existingReferral?.id ?? null;
      if (!flagged && !referralId) {
        const [inserted] = await manager.query<{ id: string }[]>(
          `
            INSERT INTO referrals
              (referrer_id, referee_id, code, signup_ip_hash, signup_device_hash)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (referee_id) DO NOTHING
            RETURNING id::text AS id
          `,
          [
            context.referrer_id,
            params.userId,
            context.referrer_code ?? '',
            params.ipHash,
            context.install_id_hash,
          ],
        );
        if (!inserted) return { status: 'REFERRER_EXISTS' };
        referralId = inserted.id;
      }

      const riskStatus = flagged
        ? AttributionRiskStatuses.PENDING_REVIEW
        : AttributionRiskStatuses.QUALIFIED;
      await manager.query(
        `
          INSERT INTO attribution_claims
            (global_id, click_id, resolution_id, claim_jti, referrer_id, referred_user_id,
             referral_id, risk_status, risk_reason, ip_hash)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          randomUUID(),
          context.click_id,
          context.resolution_id,
          params.claimJti,
          context.referrer_id,
          params.userId,
          referralId,
          riskStatus,
          flagged ? 'INSTALL_REUSED' : null,
          params.ipHash,
        ],
      );
      return { status: 'CLAIMED', riskStatus, created: true };
    });
  }

  public async listClaims(params: {
    riskStatus?: AttributionRiskStatuses;
    skip: number;
    take: number;
  }): Promise<{ items: IAttributionClaimRow[]; total: number }> {
    const filter = params.riskStatus ? 'WHERE claim.risk_status = $1' : '';
    const filterParams = params.riskStatus ? [params.riskStatus] : [];
    const offset = filterParams.length;
    const rows = await this.manager.query<IClaimRow[]>(
      `${ClaimSelect} ${filter}
       ORDER BY claim.claimed_at DESC, claim.global_id
       LIMIT $${offset + 1} OFFSET $${offset + 2}`,
      [...filterParams, params.take, params.skip],
    );
    const [{ total }] = await this.manager.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM attribution_claims claim ${filter}`,
      filterParams,
    );
    return { items: rows.map(toClaim), total };
  }

  public async reviewClaim(params: {
    claimId: string;
    reviewerId: string;
    decision: 'APPROVE' | 'REJECT';
    note: string;
  }): Promise<ReviewAttributionClaimOutcome> {
    return this.manager.transaction(async (manager) => {
      const [claim] = await manager.query<
        {
          risk_status: AttributionRiskStatuses;
          referrer_id: string;
          referred_user_id: string;
          install_id_hash: string;
          ip_hash: string | null;
          referrer_code: string | null;
        }[]
      >(
        `
          SELECT claim.risk_status, claim.referrer_id, claim.referred_user_id,
                 resolution.install_id_hash, claim.ip_hash,
                 referrer.referral_code AS referrer_code
          FROM attribution_claims claim
          JOIN attribution_resolutions resolution ON resolution.id = claim.resolution_id
          JOIN users referrer ON referrer.global_id = claim.referrer_id
          WHERE claim.global_id = $1
          FOR UPDATE OF claim
        `,
        [params.claimId],
      );
      if (!claim) return { status: 'NOT_FOUND' };
      if (claim.risk_status !== AttributionRiskStatuses.PENDING_REVIEW)
        return { status: 'ALREADY_REVIEWED' };

      let referralId: string | null = null;
      if (params.decision === 'APPROVE') {
        const [inserted] = await manager.query<{ id: string }[]>(
          `
            INSERT INTO referrals
              (referrer_id, referee_id, code, signup_ip_hash, signup_device_hash)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (referee_id) DO NOTHING
            RETURNING id::text AS id
          `,
          [
            claim.referrer_id,
            claim.referred_user_id,
            claim.referrer_code ?? '',
            claim.ip_hash,
            claim.install_id_hash,
          ],
        );
        if (!inserted) return { status: 'REFERRER_EXISTS' };
        referralId = inserted.id;
      }

      const status =
        params.decision === 'APPROVE'
          ? AttributionRiskStatuses.QUALIFIED
          : AttributionRiskStatuses.REJECTED;
      await updateReturning(
        manager,
        `
          UPDATE attribution_claims
          SET risk_status = $2, referral_id = $3, reviewed_at = now(),
              reviewed_by = $4, review_note = $5
          WHERE global_id = $1
          RETURNING global_id
        `,
        [params.claimId, status, referralId, params.reviewerId, params.note],
      );
      await manager.query(
        `INSERT INTO admin_audit_logs
           (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
         VALUES ($1, $2, 'ATTRIBUTION_CLAIM', $3, $4::jsonb, $5::jsonb, $6)`,
        [
          params.reviewerId,
          params.decision === 'APPROVE'
            ? 'ATTRIBUTION_CLAIM_APPROVE'
            : 'ATTRIBUTION_CLAIM_REJECT',
          params.claimId,
          JSON.stringify({ riskStatus: claim.risk_status }),
          JSON.stringify({ riskStatus: status, referralId }),
          params.note,
        ],
      );

      const [row] = await manager.query<IClaimRow[]>(
        `${ClaimSelect} WHERE claim.global_id = $1`,
        [params.claimId],
      );
      return { status: 'REVIEWED', claim: toClaim(row) };
    });
  }

  public async revokeLinks(params: {
    actorId: string;
    linkCode?: string;
    campaign?: string;
    referrerId?: string;
    reason: string;
  }): Promise<number> {
    const [column, value] = params.linkCode
      ? ['code', params.linkCode]
      : params.campaign
        ? ['campaign', params.campaign]
        : ['referrer_id::text', params.referrerId ?? ''];
    return this.manager.transaction(async (manager) => {
      const revoked = await updateReturning<{ code: string }>(
        manager,
        `
          UPDATE attribution_links
          SET revoked_at = now(), revoked_by = $2, revoke_reason = $3
          WHERE ${column} = $1 AND revoked_at IS NULL
          RETURNING code
        `,
        [value, params.actorId, params.reason],
      );
      if (revoked.length > 0)
        await manager.query(
          `INSERT INTO admin_audit_logs
             (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
           VALUES ($1, 'ATTRIBUTION_LINKS_REVOKE', 'ATTRIBUTION_LINK', $2, $3::jsonb, $4::jsonb, $5)`,
          [
            params.actorId,
            value,
            JSON.stringify({ by: column.replace('::text', ''), value }),
            JSON.stringify({ revokedCodes: revoked.map((row) => row.code) }),
            params.reason,
          ],
        );
      return revoked.length;
    });
  }

  public async recordAudit(event: {
    event: 'LINK' | 'CLICK' | 'RESOLVE' | 'CLAIM' | 'REVIEW' | 'REVOKE';
    outcome: string;
    clickId?: string | null;
    userId?: string | null;
    installIdHash?: string | null;
    ipHash?: string | null;
  }): Promise<void> {
    await this.manager.query(
      `
        INSERT INTO attribution_audit_events
          (event, outcome, click_id, user_id, install_id_hash, ip_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        event.event,
        event.outcome,
        event.clickId ?? null,
        event.userId ?? null,
        event.installIdHash ?? null,
        event.ipHash ?? null,
      ],
    );
  }
}
