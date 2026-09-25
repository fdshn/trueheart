import { TooManyRequestsException } from '@/domain/exceptions';
import { RequestThrottle } from './request-throttle';

function makeRedis(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn(async () => null),
    ttl: jest.fn(async () => 42),
    incr: jest.fn(async () => 1),
    expire: jest.fn(async () => 1),
    ...overrides,
  };
}

describe('RequestThrottle', () => {
  it('chưa chạm trần thì cho qua', async () => {
    const redis = makeRedis({ get: jest.fn(async () => '3') });

    await expect(
      new RequestThrottle(redis as never).assertWithinLimit({
        bucket: 'login-ip',
        key: '203.0.113.7',
        limit: 5,
      }),
    ).resolves.toBeUndefined();
  });

  it('chạm trần thì ném kèm số giây còn phải chờ', async () => {
    const redis = makeRedis({ get: jest.fn(async () => '5') });

    await expect(
      new RequestThrottle(redis as never).assertWithinLimit({
        bucket: 'login-ip',
        key: '203.0.113.7',
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
    expect(redis.ttl).toHaveBeenCalled();
  });

  it('KHÔNG đưa giá trị gốc của IP vào tên khoá', async () => {
    // Redis thường không mã hoá và ai đọc được cũng liệt kê hết khoá.
    const redis = makeRedis({ get: jest.fn(async () => null) });

    await new RequestThrottle(redis as never).assertWithinLimit({
      bucket: 'login-ip',
      key: '203.0.113.7',
      limit: 5,
    });

    const key = String((redis.get as jest.Mock).mock.calls[0][0]);
    expect(key).not.toContain('203.0.113.7');
    expect(key.startsWith('throttle:login-ip:')).toBe(true);
  });

  it('đặt hạn CHỈ ở lần đếm đầu tiên', async () => {
    // Gia hạn theo mỗi lần thì một nguồn gọi chậm rãi tự khoá mình vĩnh viễn.
    const redis = makeRedis({ incr: jest.fn(async () => 2) });

    await new RequestThrottle(redis as never).registerHit({
      bucket: 'register-ip',
      key: '203.0.113.7',
      windowSeconds: 3600,
    });

    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('Redis chết thì cho qua chứ không chặn cả hệ thống', async () => {
    const redis = makeRedis({
      get: jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    });

    await expect(
      new RequestThrottle(redis as never).assertWithinLimit({
        bucket: 'login-ip',
        key: '203.0.113.7',
        limit: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
