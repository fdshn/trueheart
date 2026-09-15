import Redis from 'ioredis';
import { RedisTokenDenyList } from './token-deny-list';

const UserId = '11111111-1111-1111-1111-111111111111';
const AccessTtlSeconds = 900;

/** Redis giả, chỉ đủ cho `set`/`get` — không quan tâm TTL vì test chạy tức thì. */
function makeRedisMock() {
  const store = new Map<string, string>();

  return {
    store,
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);

      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
  } as unknown as Redis & { store: Map<string, string> };
}

function atSecondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

describe('RedisTokenDenyList', () => {
  it('chưa thu hồi thì mọi token đều hợp lệ', async () => {
    const denyList = new RedisTokenDenyList(makeRedisMock(), AccessTtlSeconds);

    await expect(denyList.isRevoked(UserId, atSecondsAgo(600))).resolves.toBe(
      false,
    );
  });

  it('token phát trước lúc thu hồi thì hỏng', async () => {
    const denyList = new RedisTokenDenyList(makeRedisMock(), AccessTtlSeconds);

    await denyList.revokeIssuedBefore(UserId);

    await expect(denyList.isRevoked(UserId, atSecondsAgo(60))).resolves.toBe(
      true,
    );
  });

  it('token phát SAU lúc thu hồi vẫn dùng được', async () => {
    const denyList = new RedisTokenDenyList(makeRedisMock(), AccessTtlSeconds);

    await denyList.revokeIssuedBefore(UserId);

    // Đây là điều kiện sống còn: đổi mật khẩu xong người dùng đăng nhập lại
    // ngay, token mới không được dính lệnh thu hồi vừa nãy của chính họ.
    await expect(
      denyList.isRevoked(UserId, new Date(Date.now() + 5_000)),
    ).resolves.toBe(false);
  });

  it('thu hồi của tài khoản này không đụng tài khoản khác', async () => {
    const denyList = new RedisTokenDenyList(makeRedisMock(), AccessTtlSeconds);

    await denyList.revokeIssuedBefore(UserId);

    await expect(
      denyList.isRevoked(
        '22222222-2222-2222-2222-222222222222',
        atSecondsAgo(60),
      ),
    ).resolves.toBe(false);
  });

  it('đặt hạn sống cho khoá dài hơn tuổi thọ access token', async () => {
    const redis = makeRedisMock();

    await new RedisTokenDenyList(redis, AccessTtlSeconds).revokeIssuedBefore(
      UserId,
    );

    expect(redis.set).toHaveBeenCalledWith(
      `auth:revoked:${UserId}`,
      expect.any(String),
      'EX',
      AccessTtlSeconds + 60,
    );
  });

  it('lỗi Redis được ném ra, KHÔNG nuốt', async () => {
    const redis = makeRedisMock();

    (redis.set as jest.Mock).mockRejectedValueOnce(new Error('mất kết nối'));

    // Nuốt lỗi ở đây nghĩa là báo "đã thu hồi" trong khi chưa thu hồi gì.
    await expect(
      new RedisTokenDenyList(redis, AccessTtlSeconds).revokeIssuedBefore(
        UserId,
      ),
    ).rejects.toThrow('mất kết nối');
  });
});
