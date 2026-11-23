import { UserNotFoundException } from '@/domain/exceptions';
import {
  PointFeedExcludedRuleCodes,
  PointFeedMergedRuleCodes,
} from '@chantam.vn/chantam.core-lib/models';
import { GetPointFeedUseCase } from './get-point-feed.use-case';

const Viewer = '11111111-1111-4111-8111-111111111111';
const Other = '22222222-2222-4222-8222-222222222222';

function row(entryId: number, overrides: Record<string, unknown> = {}) {
  return {
    entryId,
    userId: Other,
    username: 'nguoi-khac',
    fullName: 'Người Khác',
    avatarUrl: null,
    rank: 'MEMBER',
    ruleCode: 'CHARITY_PARTICIPATION',
    delta: 60,
    bonusDelta: 30,
    bonusPercent: 50,
    occurredAt: new Date('2026-11-23T01:00:00Z'),
    context: {
      type: 'CHARITY_CAMPAIGN' as const,
      id: 'campaign-1',
      title: 'Mùa đông ấm',
    },
    ...overrides,
  };
}

function make(
  options: {
    rows?: unknown[];
    visible?: boolean;
    config?: Record<string, number>;
  } = {},
) {
  const feed = {
    list: jest.fn(async () => options.rows ?? [row(5), row(6)]),
    latestId: jest.fn(async () => 9),
    isFeedVisible: jest.fn(async () => options.visible ?? true),
  };
  const store = new Map<string, unknown>();
  const cache = {
    read: jest.fn(async (key: string) => (store.get(key) as never) ?? null),
    write: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
  const throttle = {
    assertWithinLimit: jest.fn(async () => undefined),
    registerHit: jest.fn(async () => undefined),
  };
  const admin = {
    getConfigValue: jest.fn(
      async (key: string) => options.config?.[key] ?? null,
    ),
  };
  const ledger = {
    getSummary: jest.fn(async () => ({
      balance: 120,
      rawBalance: 120,
      lifetime: 300,
    })),
  };
  const useCase = new GetPointFeedUseCase(
    feed as never,
    cache as never,
    throttle as never,
    admin as never,
    ledger as never,
  );
  return { useCase, feed, cache, throttle, admin, ledger };
}

describe('GetPointFeedUseCase (CR 22/11/2026)', () => {
  it('afterId → chỉ bản ghi mới hơn, tăng dần; gộp thưởng vào dòng gốc', async () => {
    const { useCase, feed } = make();
    const result = await useCase.handle({
      viewerId: Viewer,
      userId: null,
      afterId: 4,
      limit: 20,
    });
    expect(feed.list).toHaveBeenCalledWith(
      expect.objectContaining({
        afterId: 4,
        userId: null,
        minDelta: 10,
        excludedRuleCodes: PointFeedExcludedRuleCodes,
        mergedRuleCodes: PointFeedMergedRuleCodes,
      }),
    );
    expect(result.entries.map((entry) => entry.entryId)).toEqual([5, 6]);
    expect(result.entries[0]).toEqual({
      entryId: 5,
      user: {
        userId: Other,
        username: 'nguoi-khac',
        displayName: 'Người Khác',
        avatarUrl: null,
        rank: 'MEMBER',
      },
      delta: 90,
      bonusPercent: 50,
      ruleTitle: 'Tham gia dự án từ thiện',
      occurredAt: '2026-11-23T01:00:00.000Z',
      context: {
        type: 'CHARITY_CAMPAIGN',
        id: 'campaign-1',
        title: 'Mùa đông ấm',
      },
    });
    const json = JSON.stringify(result);
    for (const leaked of ['ruleCode', 'reason', 'referenceId', 'referenceType'])
      expect(json).not.toContain(leaked);
  });

  it('đọc latestId TRƯỚC rồi chỉ lấy dòng id ≤ latestId — không bỏ sót dòng commit chen giữa (review M1)', async () => {
    const { useCase, feed } = make();
    await useCase.handle({
      viewerId: Viewer,
      userId: null,
      afterId: 4,
      limit: 20,
    });
    expect(feed.list).toHaveBeenCalledWith(
      expect.objectContaining({ upToId: 9 }),
    );
    expect(feed.latestId.mock.invocationCallOrder[0]).toBeLessThan(
      feed.list.mock.invocationCallOrder[0],
    );
  });

  it('không có thưởng → bonusPercent null', async () => {
    const { useCase } = make({ rows: [row(5, { bonusDelta: 0 })] });
    const result = await useCase.handle({
      viewerId: Viewer,
      userId: null,
      afterId: null,
      limit: 20,
    });
    expect(result.entries[0].delta).toBe(60);
    expect(result.entries[0].bonusPercent).toBeNull();
  });

  it('không có gì mới → entries [] kèm latestId', async () => {
    const { useCase } = make({ rows: [] });
    const result = await useCase.handle({
      viewerId: Viewer,
      userId: null,
      afterId: 9,
      limit: 20,
    });
    expect(result).toMatchObject({ entries: [], latestId: 9 });
  });

  it('người khác xem feed user đã tắt → 404', async () => {
    const { useCase, feed } = make({ visible: false });
    await expect(
      useCase.handle({
        viewerId: Viewer,
        userId: Other,
        afterId: null,
        limit: 20,
      }),
    ).rejects.toThrow(UserNotFoundException);
    expect(feed.list).not.toHaveBeenCalled();
  });

  it('chính mình xem được (cờ tắt), không áp ngưỡng, kèm balance/lifetime', async () => {
    const { useCase, feed } = make({
      visible: false,
      rows: [row(5, { userId: Viewer })],
    });
    const result = await useCase.handle({
      viewerId: Viewer,
      userId: Viewer,
      afterId: null,
      limit: 20,
    });
    expect(feed.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: Viewer, minDelta: 0 }),
    );
    expect(result).toMatchObject({ balance: 120, lifetime: 300 });
  });

  it('feed chung lần hai trong 5 giây đọc cache, repository.list gọi một lần', async () => {
    const { useCase, feed, cache } = make();
    const command = {
      viewerId: Viewer,
      userId: null,
      afterId: null,
      limit: 20,
    };
    await useCase.handle(command);
    await useCase.handle(command);
    expect(feed.list).toHaveBeenCalledTimes(1);
    expect(cache.write).toHaveBeenCalledWith(
      'cache:point_feed:latest:20',
      expect.anything(),
    );
  });

  it('vượt rate limit → TooManyRequests (lỗi của throttle đi thẳng ra), không đọc gì', async () => {
    const { useCase, throttle, feed } = make();
    const limited = new Error('too many');
    throttle.assertWithinLimit.mockRejectedValueOnce(limited);
    await expect(
      useCase.handle({
        viewerId: Viewer,
        userId: null,
        afterId: null,
        limit: 20,
      }),
    ).rejects.toBe(limited);
    expect(throttle.assertWithinLimit).toHaveBeenCalledWith({
      bucket: 'point-feed',
      key: Viewer,
      limit: 30,
    });
    expect(feed.list).not.toHaveBeenCalled();
  });

  it('pollAfterSeconds/displayIntervalMs lấy từ cấu hình', async () => {
    const { useCase } = make({
      config: {
        'point.feed_poll_seconds': 30,
        'point.feed_display_interval_ms': 500,
        'point.feed_min_delta': 25,
      },
    });
    const result = await useCase.handle({
      viewerId: Viewer,
      userId: null,
      afterId: null,
      limit: 20,
    });
    expect(result).toMatchObject({
      pollAfterSeconds: 30,
      displayIntervalMs: 500,
    });
  });
});
