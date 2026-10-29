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
    listVisible: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

type UserRow = {
  globalId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: string;
  status: string;
  deletedAt: Date | null;
  showOnlineStatus: boolean;
};

const person = (
  globalId: string,
  overrides: Partial<UserRow> = {},
): UserRow => ({
  globalId,
  username: `u-${globalId.slice(-2)}`,
  fullName: null,
  avatarUrl: null,
  rank: 'MEMBER',
  status: 'ACTIVE',
  deletedAt: null,
  showOnlineStatus: true,
  ...overrides,
});

function makeUsers(
  rows: UserRow[] = [person(UserId, { showOnlineStatus: false })],
) {
  return {
    findOneBy: jest.fn(
      async ({ globalId }: { globalId: string }) =>
        rows.find((row) => row.globalId === globalId) ?? null,
    ),
    findBy: jest.fn(async () => rows),
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
      makeUsers() as never,
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
      new PresenceHeartbeatUseCase(
        store as never,
        throttle as never,
        makeUsers() as never,
      ).handle({
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
      makeUsers() as never,
    ).handle({
      userId: UserId,
      sessionId: SessionId,
      surface: PresenceSurfaces.DHARMA_HOME,
    });

    expect(result.presence.refreshed).toBe(false);
  });
});

describe('GetSurfacePresenceUseCase', () => {
  it('chưa ai bật hiện trạng thái online: chỉ có con số', async () => {
    const store = makeStore();

    const result = await new GetSurfacePresenceUseCase(
      store as never,
      makeUsers([]) as never,
    ).handle({
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
      makeStore({
        countOnline: jest.fn().mockResolvedValue(null),
        listVisible: jest.fn().mockResolvedValue(null),
      }) as never,
      makeUsers([]) as never,
    ).handle({ surface: PresenceSurfaces.DHARMA_FORUM });

    expect(result.presence.onlineCount).toBe(0);
    expect(result.presence.visibleUsers).toEqual([]);
  });

  it('visibleUsers (PR #46 §10.5): chỉ người ACTIVE còn bật cờ, giữ thứ tự Redis, bỏ chính người gọi, cắt theo limit', async () => {
    const [a, b, c, d, e] = ['01', '02', '03', '04', '05'].map(
      (tail) => `30000000-0000-4000-8000-0000000000${tail}`,
    );
    // Redis: e mới nhất, rồi d, c, b, a. Người gọi là c.
    const store = makeStore({
      listVisible: jest.fn().mockResolvedValue([e, d, c, b, a]),
    });
    const users = makeUsers([
      person(a),
      person(b, { status: 'BANNED' }), // bị khoá sau khi heartbeat
      person(c),
      person(d, { showOnlineStatus: false }), // vừa tắt cờ, Redis chưa kịp dọn
      person(e, { avatarUrl: 'https://cdn.test/e.png' }),
    ]);

    const result = await new GetSurfacePresenceUseCase(
      store as never,
      users as never,
    ).handle({
      surface: PresenceSurfaces.DHARMA_FORUM,
      currentUserId: c,
      limit: 2,
    });

    // limit + 1 để còn đủ người sau khi bỏ chính người gọi.
    expect(store.listVisible).toHaveBeenCalledWith(
      PresenceSurfaces.DHARMA_FORUM,
      expect.any(Number),
      3,
    );
    expect(result.presence.visibleUsers).toEqual([
      {
        username: `u-${e.slice(-2)}`,
        fullName: null,
        avatarUrl: 'https://cdn.test/e.png',
        rank: 'MEMBER',
      },
      {
        username: `u-${a.slice(-2)}`,
        fullName: null,
        avatarUrl: null,
        rank: 'MEMBER',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(e);
  });
});

describe('PresenceHeartbeatUseCase — người bật hiện trạng thái', () => {
  it.each([
    [true, true],
    [false, false],
  ])(
    'showOnlineStatus=%s → visible=%s trong heartbeat',
    async (flag, visible) => {
      const store = makeStore();

      await new PresenceHeartbeatUseCase(
        store as never,
        makeThrottle() as never,
        makeUsers([person(UserId, { showOnlineStatus: flag })]) as never,
      ).handle({
        userId: UserId,
        sessionId: SessionId,
        surface: PresenceSurfaces.DHARMA_HOME,
      });

      expect(store.heartbeat).toHaveBeenCalledWith(
        expect.objectContaining({ userId: UserId, visible }),
      );
    },
  );
});
