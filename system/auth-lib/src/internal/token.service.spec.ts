import { JwtService } from '@nestjs/jwt';
import { IAuthPrincipal } from '../contracts';
import { TokenExpiredException, TokenInvalidException } from '../exceptions';
import { IAuthOptions } from './auth-options';
import { TokenService } from './token.service';

const secret = 'khoa-bi-mat-du-dai-cho-bai-kiem-tra-nay-0123456789';

function makeService(accessTtlSeconds = 900): TokenService {
  const options: IAuthOptions = {
    jwtSecret: secret,
    accessTtlSeconds,
    refreshTtlSeconds: 2_592_000,
    bcryptRounds: 4,
    publicPathPrefixes: ['/health'],
  };

  return new TokenService(new JwtService({ secret }), options);
}

const principal: IAuthPrincipal = {
  userId: '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5a6b',
  username: 'nguoi-dung',
  rank: 'MEMBER',
  status: 'ACTIVE',
};

describe('TokenService — access token', () => {
  it('ký rồi kiểm lại ra đúng danh tính ban đầu', async () => {
    const service = makeService();
    const token = await service.signAccessToken(principal);

    await expect(service.verifyAccessToken(token)).resolves.toEqual({
      ...principal,
      // JWT tự đóng dấu `iat`; guard cần nó để đối chiếu danh sách thu hồi.
      issuedAt: expect.any(Date),
    });
  });

  it('trả về thời điểm phát hành khớp với `iat` của token', async () => {
    const service = makeService();
    const before = Math.floor(Date.now() / 1000);
    const token = await service.signAccessToken(principal);

    const verified = await service.verifyAccessToken(token);
    const issuedAtSeconds = Math.floor(verified.issuedAt!.getTime() / 1000);

    expect(issuedAtSeconds).toBeGreaterThanOrEqual(before);
    expect(issuedAtSeconds).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it('token hết hạn ném TokenExpiredException', async () => {
    // TTL âm: token sinh ra đã hết hạn từ trước.
    const token = await makeService(-10).signAccessToken(principal);

    await expect(makeService().verifyAccessToken(token)).rejects.toBeInstanceOf(
      TokenExpiredException,
    );
  });

  it('token bị sửa nội dung ném TokenInvalidException', async () => {
    const service = makeService();
    const token = await service.signAccessToken(principal);
    const [header, payload, signature] = token.split('.');

    // Đổi payload nhưng giữ nguyên chữ ký — đây là phép thử then chốt: nếu lọt
    // thì bất kỳ ai cũng tự nâng rank của mình được.
    const forged = Buffer.from(
      JSON.stringify({ ...principal, rnk: 'DIAMOND' }),
    ).toString('base64url');

    await expect(
      service.verifyAccessToken(`${header}.${forged}.${signature}`),
    ).rejects.toBeInstanceOf(TokenInvalidException);
    expect(payload).not.toBe(forged);
  });

  it('token ký bằng khoá khác bị từ chối', async () => {
    const foreign = new JwtService({
      secret: 'khoa-khac-nhung-cung-du-dai-0123456789012',
    });
    const token = await foreign.signAsync({ sub: 'x', usr: 'y' });

    await expect(makeService().verifyAccessToken(token)).rejects.toBeInstanceOf(
      TokenInvalidException,
    );
  });

  it('chuỗi rác bị từ chối', async () => {
    await expect(
      makeService().verifyAccessToken('khong-phai-jwt'),
    ).rejects.toBeInstanceOf(TokenInvalidException);
  });
});

describe('TokenService — refresh token', () => {
  it('mỗi lần sinh ra một giá trị khác nhau', () => {
    const service = makeService();
    const tokens = new Set(
      Array.from({ length: 500 }, () => service.generateRefreshToken()),
    );

    expect(tokens.size).toBe(500);
  });

  it('đủ dài để không dò được (32 byte)', () => {
    const token = makeService().generateRefreshToken();

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('băm là tất định — cùng token ra cùng giá trị', () => {
    const service = makeService();
    const token = service.generateRefreshToken();

    expect(service.hashRefreshToken(token)).toBe(
      service.hashRefreshToken(token),
    );
  });

  it('băm không làm lộ token gốc', () => {
    const service = makeService();
    const token = service.generateRefreshToken();
    const hashed = service.hashRefreshToken(token);

    expect(hashed).not.toContain(token);
    expect(hashed).toHaveLength(64);
  });
});
