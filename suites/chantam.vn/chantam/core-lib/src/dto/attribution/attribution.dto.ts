import {
  IPaginationMetaDto,
  IPaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import {
  AttributionPlatforms,
  AttributionRiskStatuses,
  AttributionTargetTypes,
} from '../../consts';

/** Đích deep link. `value`: mã chia sẻ bài, username, hoặc mã mời nhóm. */
export interface IAttributionDeepLinkDto {
  type: AttributionTargetTypes;
  value: string;
}

// ── Tạo link (người giới thiệu, Bearer) ─────────────────────────────────────

export interface ICreateAttributionLinkDto {
  /** Bỏ trống cả hai = link mời chung, không mở nội dung nào. */
  targetType?: AttributionTargetTypes | null;
  targetValue?: string | null;
  campaign?: string | null;
  source?: string | null;
  medium?: string | null;
}

export interface ICreateAttributionLinkBodyDto {
  link: ICreateAttributionLinkDto;
}

export interface IAttributionLinkDto {
  /** Mã ngắn trong URL `…/a/{code}`. */
  code: string;
  /** `null` khi máy chủ chưa cấu hình `WEB_PUBLIC_BASE_URL`. */
  url: string | null;
  deepLink: IAttributionDeepLinkDto | null;
  campaign: string | null;
  source: string | null;
  medium: string | null;
  createdAt: Date;
}

export interface ICreateAttributionLinkResponseDto {
  link: IAttributionLinkDto;
  /** `false` khi link y hệt đã có và được trả lại. */
  created: boolean;
}

// ── Ghi nhận lượt mở link (landing, công khai) ─────────────────────────────

export interface IRecordAttributionClickDto {
  code: string;
}

export interface IRecordAttributionClickBodyDto {
  click: IRecordAttributionClickDto;
}

/** Người giới thiệu — đúng hình hồ sơ công khai, KHÔNG có id. */
export interface IAttributionReferrerDto {
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface IRecordAttributionClickResponseDto {
  click: {
    /** Token có chữ ký; landing đặt vào `…/dl?t=<token>` và copy vào clipboard khi người dùng bấm. */
    token: string;
    expiresAt: Date;
    /** `…/dl?t=<token>`; `null` khi chưa cấu hình `WEB_PUBLIC_BASE_URL`. */
    deepLinkUrl: string | null;
    referrer: IAttributionReferrerDto;
    deepLink: IAttributionDeepLinkDto | null;
  };
}

// ── Resolve (app mới cài, công khai) ───────────────────────────────────────

export interface IResolveAttributionBodyDto {
  /** Token dán từ clipboard; chấp nhận cả nguyên URL `…/dl?t=<token>`. */
  token: string;
  /** UUID app sinh một lần, lưu trong secure storage. Chỉ lưu dạng băm. */
  installId: string;
  platform: AttributionPlatforms;
}

export interface IResolveAttributionResponseDto {
  matched: boolean;
  /** Claim token dùng một lần — gửi lên `POST /attribution/claim` sau khi đăng ký. */
  attributionToken: string | null;
  /** Chỉ để hiển thị. Claim KHÔNG đọc trường này. */
  referralCode: string | null;
  deepLink: IAttributionDeepLinkDto | null;
}

// ── Claim (Bearer, ngay sau đăng ký) ───────────────────────────────────────

export interface IClaimAttributionBodyDto {
  attributionToken: string;
}

export interface IClaimAttributionResponseDto {
  claimed: boolean;
  /**
   * `PENDING_REVIEW` khi vướng tín hiệu gian lận: quan hệ giới thiệu CHƯA được ghi, chờ Admin.
   * App không cần xử lý khác — với người dùng, claim đã xong.
   */
  riskStatus: AttributionRiskStatuses;
}

// ── Admin ───────────────────────────────────────────────────────────────────

export interface IListAttributionClaimsQueryDto extends IPaginationQueryDto {
  riskStatus?: AttributionRiskStatuses;
}

export interface IAttributionClaimSummaryDto {
  claimId: string;
  riskStatus: AttributionRiskStatuses;
  /** Mã nghiệp vụ của tín hiệu rủi ro, `null` khi không vướng gì. */
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
  /** Người được mời đã hoàn tất onboarding và người giới thiệu đã được thưởng. */
  referralQualifiedAt: Date | null;
}

export interface IListAttributionClaimsResponseDto {
  claims: IAttributionClaimSummaryDto[];
  meta: IPaginationMetaDto;
}

export interface IReviewAttributionClaimDto {
  decision: 'APPROVE' | 'REJECT';
  note: string;
}

export interface IReviewAttributionClaimBodyDto {
  review: IReviewAttributionClaimDto;
}

export interface IReviewAttributionClaimResponseDto {
  claim: IAttributionClaimSummaryDto;
}

/** Đúng một trong ba: một link, cả chiến dịch, hoặc mọi link của một người giới thiệu. */
export interface IRevokeAttributionLinksDto {
  linkCode?: string;
  campaign?: string;
  referrerUserId?: string;
  reason: string;
}

export interface IRevokeAttributionLinksBodyDto {
  revocation: IRevokeAttributionLinksDto;
}

export interface IRevokeAttributionLinksResponseDto {
  /** Số link vừa bị thu hồi (link đã thu hồi từ trước không tính lại). */
  revokedLinks: number;
}
