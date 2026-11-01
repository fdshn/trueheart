import { IConfig } from '@/domain/ports/config';
import {
  AttributionTokenKind,
  AttributionTokenVerification,
  IAttributionTokenService,
} from '@/domain/ports/security';
import {
  AttributionClaimAudience,
  AttributionResolveAudience,
} from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';
import {
  createPrivateKey,
  createPublicKey,
  KeyObject,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto';

const Header = { alg: 'EdDSA', typ: 'JWT' } as const;

const AudienceOf: Record<AttributionTokenKind, string> = {
  RESOLVE: AttributionResolveAudience,
  CLAIM: AttributionClaimAudience,
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(segment, 'base64url').toString('utf8'),
    );
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * JWS compact, `alg: EdDSA` (Ed25519), có `kid` để xoay khoá.
 *
 * - Khoá ĐẦU của `ATTRIBUTION_SIGNING_KEYS` ký; MỌI khoá trong danh sách đều xác minh được.
 *   Xoay khoá: thêm khoá mới lên đầu, giữ khoá cũ tới khi token cũ hết hạn (14 ngày), rồi bỏ.
 * - Ed25519 là chữ ký tiền định: cùng claims ra cùng chuỗi token — resolve lặp lại trả
 *   đúng claim token cũ mà không phải lưu chuỗi token.
 * - Không dùng thư viện JWT: chỉ một thuật toán, một khuôn header, và tự viết thì không có
 *   cửa `alg: none` hay nhầm thuật toán nào để mở.
 */
@Injectable()
export class Ed25519AttributionTokenService implements IAttributionTokenService {
  private readonly signer: { kid: string; key: KeyObject } | null;
  private readonly verifiers: Map<string, KeyObject>;

  public constructor(@Inject(IConfig) config: IConfig) {
    const keys = config.attribution.signingKeys.map(
      ({ kid, privateKeyPem }) => {
        const key = createPrivateKey(privateKeyPem);
        if (key.asymmetricKeyType !== 'ed25519')
          throw new Error(
            `ATTRIBUTION_SIGNING_KEYS: khoá "${kid}" phải là Ed25519, nhận ${key.asymmetricKeyType}`,
          );
        return { kid, key };
      },
    );
    this.signer = keys[0] ?? null;
    this.verifiers = new Map(
      keys.map(({ kid, key }) => [kid, createPublicKey(key)]),
    );
  }

  public isConfigured(): boolean {
    return this.signer !== null;
  }

  public sign(
    kind: AttributionTokenKind,
    claims: { jti: string; issuedAt: Date; expiresAt: Date },
  ): string {
    if (!this.signer) throw new Error('ATTRIBUTION_SIGNING_KEYS chưa cấu hình');
    const header = encodeSegment({ ...Header, kid: this.signer.kid });
    const payload = encodeSegment({
      jti: claims.jti,
      aud: AudienceOf[kind],
      iat: Math.floor(claims.issuedAt.getTime() / 1000),
      exp: Math.floor(claims.expiresAt.getTime() / 1000),
    });
    const signature = signBytes(
      null,
      Buffer.from(`${header}.${payload}`, 'utf8'),
      this.signer.key,
    ).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }

  public verify(
    token: string,
    kind: AttributionTokenKind,
    now: Date = new Date(),
  ): AttributionTokenVerification {
    const parts = token.trim().split('.');
    if (parts.length !== 3) return { status: 'NOT_OURS' };
    const [headerPart, payloadPart, signaturePart] = parts;

    const header = decodeSegment(headerPart);
    if (!header || header.alg !== Header.alg || typeof header.kid !== 'string')
      return { status: 'NOT_OURS' };
    const publicKey = this.verifiers.get(header.kid);
    // `kid` lạ: khoá đã bị gỡ khỏi danh sách (token quá cũ) hoặc token của nơi khác.
    if (!publicKey) return { status: 'NOT_OURS' };

    let valid = false;
    try {
      valid = verifyBytes(
        null,
        Buffer.from(`${headerPart}.${payloadPart}`, 'utf8'),
        publicKey,
        Buffer.from(signaturePart, 'base64url'),
      );
    } catch {
      valid = false;
    }
    if (!valid) return { status: 'BAD_SIGNATURE' };

    // Chỉ đọc payload SAU khi chữ ký đúng.
    const payload = decodeSegment(payloadPart);
    if (
      !payload ||
      typeof payload.jti !== 'string' ||
      typeof payload.exp !== 'number'
    )
      return { status: 'BAD_SIGNATURE' };
    if (payload.aud !== AudienceOf[kind]) return { status: 'WRONG_AUDIENCE' };

    const expiresAt = new Date(payload.exp * 1000);
    return expiresAt.getTime() <= now.getTime()
      ? { status: 'EXPIRED', jti: payload.jti, expiresAt }
      : { status: 'VALID', jti: payload.jti, expiresAt };
  }
}
