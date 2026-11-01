/**
 * Ký và xác minh token deferred attribution.
 *
 * Token CHỈ mang `jti`, `aud`, `iat`, `exp` — người giới thiệu, đích và chiến dịch nằm trong
 * database, tra theo `jti`. Token là chuỗi ai cầm link cũng đọc được payload (ký chứ không mã
 * hoá); để `referrerUserId` trong đó là phát id nội bộ cho người lạ.
 */
export type AttributionTokenKind = 'RESOLVE' | 'CLAIM';

export type AttributionTokenVerification =
  | { status: 'VALID'; jti: string; expiresAt: Date }
  /** Không phải token của hệ thống (người dùng dán nhầm thứ khác). */
  | { status: 'NOT_OURS' }
  /** Đúng khuôn, `kid` biết, nhưng chữ ký sai — giả mạo hoặc bị sửa. */
  | { status: 'BAD_SIGNATURE' }
  /** Chữ ký đúng nhưng là token loại khác (vd. claim token dán vào resolve). */
  | { status: 'WRONG_AUDIENCE' }
  /** Chữ ký đúng, đã quá `exp`. Vẫn trả `jti` để nơi gọi xử idempotent. */
  | { status: 'EXPIRED'; jti: string; expiresAt: Date };

export interface IAttributionTokenService {
  /** Có khoá ký chưa. Chưa có thì các endpoint attribution fail-closed. */
  isConfigured(): boolean;

  sign(
    kind: AttributionTokenKind,
    claims: { jti: string; issuedAt: Date; expiresAt: Date },
  ): string;

  verify(
    token: string,
    kind: AttributionTokenKind,
  ): AttributionTokenVerification;
}

export const IAttributionTokenService = Symbol('IAttributionTokenService');
