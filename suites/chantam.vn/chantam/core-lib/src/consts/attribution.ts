/**
 * Deferred attribution — ghi nhận người giới thiệu cho người cài app SAU khi bấm link
 * (yêu cầu 01/11/2026).
 *
 * ## Luồng
 *
 * ```
 * người giới thiệu ── POST /attribution/links ──▶ link `chantam.vn/a/{code}`
 * người mở link  ── landing ── POST /attribution/clicks ──▶ token (copy vào clipboard)
 * app mới cài    ── POST /attribution/resolve {token, installId} ──▶ claim token + deep link
 * app sau đăng ký ── POST /attribution/claim {attributionToken} ──▶ gắn người giới thiệu
 * ```
 *
 * Thưởng KHÔNG phát ở bước nào trong bốn bước trên: claim chỉ ghi một dòng `referrals`,
 * và đường thưởng giới thiệu sẵn có chỉ trả khi người được mời hoàn tất onboarding.
 */

/** Đích deep link app hỗ trợ. `PROFILE` và `USER` cùng nhận username. */
export enum AttributionTargetTypes {
  POST = 'POST',
  PROFILE = 'PROFILE',
  USER = 'USER',
  GROUP_INVITE = 'GROUP_INVITE',
}

export enum AttributionPlatforms {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
}

/**
 * Kết luận rủi ro của một lượt claim.
 *
 * - `QUALIFIED`: không vướng tín hiệu nào — quan hệ giới thiệu được ghi ngay.
 * - `PENDING_REVIEW`: vướng tín hiệu (vd. cùng một bản cài đã claim cho tài khoản khác) —
 *   CHƯA ghi quan hệ giới thiệu, chờ Admin duyệt.
 * - `REJECTED`: Admin từ chối — không bao giờ ghi.
 *
 * "QUALIFIED" ở đây là qua kiểm rủi ro, KHÁC với lượt giới thiệu "đủ điều kiện nhận thưởng"
 * (người được mời hoàn tất onboarding) của bảng `referrals`.
 */
export enum AttributionRiskStatuses {
  QUALIFIED = 'QUALIFIED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
}

/** `aud` của token landing copy vào clipboard (spec 01/11). */
export const AttributionResolveAudience = 'thientam-mobile-attribution';
/** `aud` của claim token — khác token resolve để không dùng lẫn được. */
export const AttributionClaimAudience = 'thientam-mobile-attribution-claim';

/** Token resolve sống 14 ngày: đủ cho người cài app vài hôm sau mới mở. */
export const AttributionResolveTokenTtlSeconds = 14 * 24 * 60 * 60;
/** Claim token dùng một lần, 24 giờ: từ lúc dán link tới lúc đăng ký xong. */
export const AttributionClaimTokenTtlSeconds = 24 * 60 * 60;
/** Chỉ tài khoản tạo trong khoảng này mới nhận claim — chặn người cũ tự gắn người giới thiệu. */
export const AttributionClaimMaxAccountAgeDays = 7;
/** Cùng bản cài đã claim cho tài khoản khác trong khoảng này thì đưa vào diện xem xét. */
export const AttributionInstallReuseWindowDays = 30;
