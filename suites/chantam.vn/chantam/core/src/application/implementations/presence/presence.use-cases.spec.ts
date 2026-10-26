import { TooManyRequestsException } from '@/domain/exceptions';
import {
  PresenceHeartbeatsPerUserPerMinute,
  PresenceSurfaces,
  PresenceTtlSeconds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  GetSurfacePresenceUseCase,
  PresenceHeartbeatUseCase,
} from './presence.use-cases';

const UserId = '10000000-0000-4000-8000-000000000001';
const SessionId = '20000000-0000-4000-8000-000000000002';

function makeStore(overrides: Record<string, jest.Mock> = {}) {
  return {
    heartbeat: jest.fn().mockResolvedValue(true),
    countOnline: jest.fn().mockResolvedValue(24),
    ...overrides,
  };
}

function makeThrottle(overrides: Record<string, jest.Mock> = {}) {
  return {
    assertWithinLimit: jest.fn().mockResolvedValue(undefined),
    registerHit: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('PresenceHeartbeatUseCase', () => {
  it('ghi heartbeat, đếm vào trần mỗi người mỗi phút, trả TTL', async () => {
    const store = makeStore();
    const throttle = makeThrottle();

    const result = await new PresenceHeartbeatUseCase(
      store as never,
      throttle as never,
    ).handle({
      userId: UserId,
      sessionId: SessionId,
      surface: PresenceSurfaces.DHARMA_FORUM,
    });

    expect(result).toEqual({
      presence: {
        surface: PresenceSurfaces.DHARMA_FORUM,
        sessionId: SessionId,
        expiresInSeconds: PresenceTtlSeconds,
        refreshed: true,
      },
    });
    expect(store.heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: UserId,
        sessionId: SessionId,
        surface: PresenceSurfaces.DHARMA_FORUM,
      }),
    );
    expect(throttle.assertWithinLimit).toHaveBeenCalledWith({
      bucket: 'presence:heartbeat',
      key: UserId,
      limit: PresenceHeartbeatsPerUserPerMinute,
    });
    expect(throttle.registerHit).toHaveBeenCalledWith({
      bucket: 'presence:heartbeat',
      key: UserId,
      windowSeconds: 60,
    });
  });

  it('vượt trần: ném TOO_MANY_REQUESTS, không chạm Redis presence', async () => {
    const store = makeStore();
    const throttle = makeThrottle({
      assertWithinLimit: jest
        .fn()
        .mockRejectedValue(new TooManyRequestsException(42)),
    });

    await expect(
      new PresenceHeartbeatUseCase(store as never, throttle as never).handle({
        userId: UserId,
        sessionId: SessionId,
        surface: PresenceSurfaces.DHARMA_HOME,
      }),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
    expect(store.heartbeat).not.toHaveBeenCalled();
  });

  it.each([
    ['lặp cùng surface quá sớm', false],
    ['Redis không trả lời', null],
  ])('%s: refreshed=false, không lỗi', async (_label, outcome) => {
    const result = await new PresenceHeartbeatUseCase(
      makeStore({ heartbeat: jest.fn().mockResolvedValue(outcome) }) as never,
      makeThrottle() as never,
    ).handle({
      userId: UserId,
      sessionId: SessionId,
      surface: PresenceSurfaces.DHARMA_HOME,
    });

    expect(result.presence.refreshed).toBe(false);
  });
});

describe('GetSurfacePresenceUseCase', () => {
  it('Phase 1: chỉ trả số người, không lộ danh tính', async () => {
    const store = makeStore();

    const result = await new GetSurfacePresenceUseCase(store as never).handle({
      surface: PresenceSurfaces.DHARMA_FORUM,
    });

    expect(result).toEqual({
      presence: {
        surface: PresenceSurfaces.DHARMA_FORUM,
        onlineCount: 24,
        visibleUsers: [],
      },
    });
  });

  it('Redis không trả lời: 0 người, không lỗi', async () => {
    const result = await new GetSurfacePresenceUseCase(
      makeStore({ countOnline: jest.fn().mockResolvedValue(null) }) as never,
    ).handle({ surface: PresenceSurfaces.DHARMA_FORUM });

    expect(result.presence.onlineCount).toBe(0);
  });
});
