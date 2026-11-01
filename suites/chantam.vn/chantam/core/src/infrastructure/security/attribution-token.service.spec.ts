import { generateKeyPairSync } from 'node:crypto';
import { parseAttributionSigningKeys } from '../config/config.loader';
import { Ed25519AttributionTokenService } from './attribution-token.service';

function ed25519Pem(): string {
  return generateKeyPairSync('ed25519')
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
}

function serviceWith(keys: { kid: string; privateKeyPem: string }[]) {
  return new Ed25519AttributionTokenService({
    attribution: { signingKeys: keys },
  } as never);
}

const now = new Date('2026-11-01T00:00:00Z');
const later = new Date('2026-11-15T00:00:00Z');
const claims = { jti: 'jti-1', issuedAt: now, expiresAt: later };
const beforeExpiry = new Date('2026-11-10T00:00:00Z');

describe('Ed25519AttributionTokenService', () => {
  const pemA = ed25519Pem();
  const pemB = ed25519Pem();

  it('token đúng chữ ký, đúng audience, chưa hết hạn → VALID kèm jti', () => {
    const service = serviceWith([{ kid: 'k1', privateKeyPem: pemA }]);
    const token = service.sign('RESOLVE', claims);

    expect(service.verify(token, 'RESOLVE', beforeExpiry)).toEqual({
      status: 'VALID',
      jti: 'jti-1',
      expiresAt: later,
    });
  });

  it('payload chỉ có jti/aud/iat/exp — không lộ người giới thiệu', () => {
    const service = serviceWith([{ kid: 'k1', privateKeyPem: pemA }]);
    const payload = JSON.parse(
      Buffer.from(
        service.sign('RESOLVE', claims).split('.')[1],
        'base64url',
      ).toString(),
    );

    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'jti']);
    expect(payload.aud).toBe('thientam-mobile-attribution');
  });

  it('ký tiền định: cùng claims ra cùng token', () => {
    const service = serviceWith([{ kid: 'k1', privateKeyPem: pemA }]);
    expect(service.sign('CLAIM', claims)).toBe(service.sign('CLAIM', claims));
  });

  it('sửa payload → BAD_SIGNATURE', () => {
    const service = serviceWith([{ kid: 'k1', privateKeyPem: pemA }]);
    const [header, , signature] = service.sign('RESOLVE', claims).split('.');
    const forged = Buffer.from(
      JSON.stringify({
        jti: 'jti-khac',
        aud: 'thientam-mobile-attribution',
        iat: 1,
        exp: 9_999_999_999,
      }),
    ).toString('base64url');

    expect(
      service.verify(
        `${header}.${forged}.${signature}`,
        'RESOLVE',
        beforeExpiry,
      ),
    ).toEqual({ status: 'BAD_SIGNATURE' });
  });

  it('ký bằng khoá lạ nhưng mượn kid → BAD_SIGNATURE', () => {
    const real = serviceWith([{ kid: 'k1', privateKeyPem: pemA }]);
    const attacker = serviceWith([{ kid: 'k1', privateKeyPem: pemB }]);

    expect(
      real.verify(attacker.sign('RESOLVE', claims), 'RESOLVE', beforeExpiry),
    ).toEqual({ status: 'BAD_SIGNATURE' });
  });

  it('claim token dán vào resolve (và ngược lại) → WRONG_AUDIENCE', () => {
    const service = serviceWith([{ kid: 'k1', privateKeyPem: pemA }]);

    expect(
      service.verify(service.sign('CLAIM', claims), 'RESOLVE', beforeExpiry)
        .status,
    ).toBe('WRONG_AUDIENCE');
    expect(
      service.verify(service.sign('RESOLVE', claims), 'CLAIM', beforeExpiry)
        .status,
    ).toBe('WRONG_AUDIENCE');
  });

  it('quá exp → EXPIRED nhưng vẫn trả jti', () => {
    const service = serviceWith([{ kid: 'k1', privateKeyPem: pemA }]);

    expect(
      service.verify(
        service.sign('RESOLVE', claims),
        'RESOLVE',
        new Date('2026-12-01T00:00:00Z'),
      ),
    ).toEqual({ status: 'EXPIRED', jti: 'jti-1', expiresAt: later });
  });

  it.each([
    ['chuỗi bất kỳ', 'xin chao'],
    ['URL thường', 'https://chantam.vn/p/ABC'],
    [
      'alg none',
      `${Buffer.from('{"alg":"none","kid":"k1"}').toString('base64url')}.e30.`,
    ],
    [
      'JWT HS256',
      `${Buffer.from('{"alg":"HS256","kid":"k1"}').toString('base64url')}.e30.c2ln`,
    ],
  ])('%s → NOT_OURS', (_label, token) => {
    const service = serviceWith([{ kid: 'k1', privateKeyPem: pemA }]);
    expect(service.verify(token, 'RESOLVE', beforeExpiry)).toEqual({
      status: 'NOT_OURS',
    });
  });

  it('xoay khoá: khoá mới ký, token ký bằng khoá cũ vẫn xác minh được', () => {
    const before = serviceWith([{ kid: 'old', privateKeyPem: pemA }]);
    const oldToken = before.sign('RESOLVE', claims);
    const rotated = serviceWith([
      { kid: 'new', privateKeyPem: pemB },
      { kid: 'old', privateKeyPem: pemA },
    ]);

    expect(rotated.verify(oldToken, 'RESOLVE', beforeExpiry).status).toBe(
      'VALID',
    );
    expect(
      JSON.parse(
        Buffer.from(
          rotated.sign('RESOLVE', claims).split('.')[0],
          'base64url',
        ).toString(),
      ).kid,
    ).toBe('new');
  });

  it('khoá cũ đã gỡ khỏi danh sách → token cũ NOT_OURS', () => {
    const oldToken = serviceWith([{ kid: 'old', privateKeyPem: pemA }]).sign(
      'RESOLVE',
      claims,
    );
    const after = serviceWith([{ kid: 'new', privateKeyPem: pemB }]);

    expect(after.verify(oldToken, 'RESOLVE', beforeExpiry).status).toBe(
      'NOT_OURS',
    );
  });

  it('chưa cấu hình khoá → isConfigured false', () => {
    expect(serviceWith([]).isConfigured()).toBe(false);
  });

  it('khoá không phải Ed25519 → ném lúc khởi tạo', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(() => serviceWith([{ kid: 'k1', privateKeyPem: rsa }])).toThrow(
      /Ed25519/,
    );
  });
});

describe('parseAttributionSigningKeys', () => {
  const pem = ed25519Pem();
  const encoded = Buffer.from(pem).toString('base64');

  it('đọc kid:base64(PEM), giữ thứ tự', () => {
    expect(
      parseAttributionSigningKeys(`b:${encoded}, a:${encoded}`).map(
        (k) => k.kid,
      ),
    ).toEqual(['b', 'a']);
  });

  it('rỗng → không khoá', () => {
    expect(parseAttributionSigningKeys('  ')).toEqual([]);
  });

  it.each([
    ['thiếu kid', encoded],
    ['không phải PEM', 'k1:aGVsbG8='],
    ['trùng kid', `k1:${encoded},k1:${encoded}`],
  ])('%s → ném lúc khởi động', (_label, raw) => {
    expect(() => parseAttributionSigningKeys(raw)).toThrow(
      /ATTRIBUTION_SIGNING_KEYS/,
    );
  });
});
