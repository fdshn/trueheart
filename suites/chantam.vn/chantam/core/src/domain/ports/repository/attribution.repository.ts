import {
  AttributionPlatforms,
  AttributionRiskStatuses,
  AttributionTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';

export interface IAttributionLink {
  id: string;
  code: string;
  referrerId: string;
  targetType: AttributionTargetTypes | null;
  targetValue: string | null;
  campaign: string | null;
  source: string | null;
  medium: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}

/** Link kèm người giới thiệu — đủ cho landing và resolve. */
export interface IAttributionLinkWithReferrer extends IAttributionLink {
  referrer: {
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
    referralCode: string | null;
    /** `ACTIVE` và chưa xoá — người bị khoá không phát link được nữa. */
    active: boolean;
  };
}

export interface IAttributionClickContext {
  clickId: string;
  expiresAt: Date;
  link: IAttributionLinkWithReferrer;
}

export type ClaimAttributionOutcome =
  | {
      status: 'CLAIMED';
      riskStatus: AttributionRiskStatuses;
      /** `false` khi đây là lượt gọi lại của chính người đã claim. */
      created: boolean;
    }
  /** Claim token không khớp lượt resolve nào. */
  | { status: 'NOT_FOUND' }
  /** Token đã hết hạn và người gọi chưa từng claim nó. */
  | { status: 'EXPIRED' }
  | { status: 'REVOKED' }
  | { status: 'ALREADY_CLAIMED' }
  | { status: 'REFERRER_EXISTS' }
  | { status: 'SELF_REFERRAL' }
  | { status: 'NOT_ELIGIBLE' };

export interface IAttributionClaimRow {
  claimId: string;
  riskStatus: AttributionRiskStatuses;
  riskReason: string | null;
  referrerUserId: string;
  referrerUsername: string;
  referredUserId: string;
  referredUsername: string;
  linkCode: string;
  campaign: string | null;
  platform: AttributionPlatforms;
  claimedAt: Date;
  reviewedAt: Date | null;
  referralQualifiedAt: Date | null;
}

export type ReviewAttributionClaimOutcome =
  | { status: 'REVIEWED'; claim: IAttributionClaimRow }
  | { status: 'NOT_FOUND' }
  | { status: 'ALREADY_REVIEWED' }
  /** Duyệt mà người được mời đã có người giới thiệu khác — không ghi được. */
  | { status: 'REFERRER_EXISTS' };

export interface IAttributionRepository {
  /** Đích còn tồn tại và mở được không — chặn phát link trỏ vào hư không. */
  targetExists(type: AttributionTargetTypes, value: string): Promise<boolean>;

  /** Link đang sống y hệt thì trả lại (`created: false`). */
  findOrCreateLink(params: {
    referrerId: string;
    targetType: AttributionTargetTypes | null;
    targetValue: string | null;
    campaign: string | null;
    source: string | null;
    medium: string | null;
  }): Promise<{ link: IAttributionLink; created: boolean }>;

  findLinkByCode(code: string): Promise<IAttributionLinkWithReferrer | null>;

  createClick(params: {
    clickId: string;
    linkId: string;
    tokenJti: string;
    issuedAt: Date;
    expiresAt: Date;
    ipHash: string | null;
    userAgentHash: string | null;
  }): Promise<void>;

  findClickByTokenJti(jti: string): Promise<IAttributionClickContext | null>;

  /**
   * Một dòng cho mỗi (lượt mở, bản cài). Gọi lại trả ĐÚNG claim jti cũ khi nó còn hạn;
   * hết hạn thì thay bằng `newClaimJti` — để resolve vẫn idempotent mà claim token không
   * sống quá 24 giờ.
   */
  upsertResolution(params: {
    clickId: string;
    installIdHash: string;
    platform: AttributionPlatforms;
    ipHash: string | null;
    newClaimJti: string;
    newClaimExpiresAt: Date;
  }): Promise<{ claimJti: string; claimExpiresAt: Date; issuedAt: Date }>;

  /**
   * Gắn người giới thiệu. Một transaction, khoá lượt mở và người được mời: hai tài khoản
   * claim song song cùng một token thì đúng một người thắng.
   *
   * `tokenExpired`: token đã quá hạn — vẫn cho người ĐÃ claim gọi lại (idempotent), từ chối
   * người mới.
   */
  claim(params: {
    claimJti: string;
    userId: string;
    tokenExpired: boolean;
    ipHash: string | null;
    maxAccountAgeDays: number;
    installReuseWindowDays: number;
  }): Promise<ClaimAttributionOutcome>;

  listClaims(params: {
    riskStatus?: AttributionRiskStatuses;
    skip: number;
    take: number;
  }): Promise<{ items: IAttributionClaimRow[]; total: number }>;

  /** Duyệt claim `PENDING_REVIEW`: APPROVE ghi `referrals`, REJECT thì không bao giờ. */
  reviewClaim(params: {
    claimId: string;
    reviewerId: string;
    decision: 'APPROVE' | 'REJECT';
    note: string;
  }): Promise<ReviewAttributionClaimOutcome>;

  /** Thu hồi link đang sống theo đúng một tiêu chí; trả số link vừa thu hồi. */
  revokeLinks(params: {
    actorId: string;
    linkCode?: string;
    campaign?: string;
    referrerId?: string;
    reason: string;
  }): Promise<number>;

  recordAudit(event: {
    event: 'LINK' | 'CLICK' | 'RESOLVE' | 'CLAIM' | 'REVIEW' | 'REVOKE';
    outcome: string;
    clickId?: string | null;
    userId?: string | null;
    installIdHash?: string | null;
    ipHash?: string | null;
  }): Promise<void>;
}

export const IAttributionRepository = Symbol('IAttributionRepository');
