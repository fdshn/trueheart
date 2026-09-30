import { TooManyRequestsException } from '@/domain/exceptions';
import { GlobalRateLimitGuard } from './global-rate-limit.guard';

function makeContext(options: {
  type?: string;
  ip?: string;
  url?: string;
  routeUrl?: string;
}) {
  const request = {
    ip: options.ip ?? '203.0.113.7',
    url: options.url ?? '/api/v1/posts',
    routeOptions: options.routeUrl ? { url: options.routeUrl } : undefined,
  };

  return {
    getType: () => options.type ?? 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function makeGuard(options: { limit?: number; overLimit?: boolean } = {}) {
  const throttle = {
    assertWithinLimit: jest.fn(async () => {
      if (options.overLimit) throw new TooManyRequestsException(42);
    }),
    registerHit: jest.fn(async () => undefined),
  };
  const config = {
    auth: { globalRateLimitPerMinute: options.limit ?? 600 },
  };

  return {
    throttle,
    guard: new GlobalRateLimitGuard(throttle as never, config as never),
  };
}

describe('GlobalRateLimitGuard', () => {
  it('đếm theo IP, hỏi trần TRƯỚC rồi ghi nhận SAU', async () => {
    // Đếm trước thì chính lượt bị từ chối cũng làm cửa sổ dài thêm — cùng lối mọi
    // chỗ dùng `IRequestThrottle` đã chọn.
    const { guard, throttle } = makeGuard({ limit: 600 });

    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);

    expect(throttle.assertWithinLimit).toHaveBeenCalledWith({
      bucket: 'http:global',
      key: '203.0.113.7',
      limit: 600,
    });
    expect(throttle.registerHit).toHaveBeenCalledWith({
      bucket: 'http:global',
      key: '203.0.113.7',
      windowSeconds: 60,
    });
    const assertOrder = throttle.assertWithinLimit.mock.invocationCallOrder[0];
    const hitOrder = throttle.registerHit.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(hitOrder);
  });

  it('chạm trần thì ném 429 và KHÔNG ghi nhận thêm', async () => {
    const { guard, throttle } = makeGuard({ overLimit: true });

    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      TooManyRequestsException,
    );
    expect(throttle.registerHit).not.toHaveBeenCalled();
  });

  it('KHÔNG áp cho /health', async () => {
    // Healthcheck hạ tầng gọi liên tục, và một `/health` bị 429 làm cổng kiểm tra
    // sau triển khai chớp tắt vô cớ — rồi người ta sẽ tắt cổng đó đi.
    const { guard, throttle } = makeGuard();

    await expect(
      guard.canActivate(makeContext({ url: '/health', routeUrl: '/health' })),
    ).resolves.toBe(true);
    expect(throttle.assertWithinLimit).not.toHaveBeenCalled();
  });

  it('KHÔNG áp cho WebSocket', async () => {
    // Một tin nhắn chat không nên tiêu hạn mức của một lượt gọi API.
    const { guard, throttle } = makeGuard();

    await expect(guard.canActivate(makeContext({ type: 'ws' }))).resolves.toBe(
      true,
    );
    expect(throttle.assertWithinLimit).not.toHaveBeenCalled();
  });

  it('IP rỗng vẫn có khoá, không gộp im lặng vào chuỗi trắng', async () => {
    const { guard, throttle } = makeGuard();

    await guard.canActivate(makeContext({ ip: '' }));

    expect(throttle.assertWithinLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'khong-ro-nguon' }),
    );
  });

  it('dùng đường của ROUTE, không phải url có query', async () => {
    // `/health?probe=1` vẫn phải được miễn: so bằng url thô thì một query string
    // đủ để lách, còn `routeOptions.url` là mẫu đường đã khớp.
    const { guard, throttle } = makeGuard();

    await guard.canActivate(
      makeContext({ url: '/health?probe=1', routeUrl: '/health' }),
    );

    expect(throttle.assertWithinLimit).not.toHaveBeenCalled();
  });
});
