import {
  CreateBroadcastUseCase,
  ProcessBroadcastUseCase,
} from './broadcast.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const BroadcastId = '30000000-0000-4000-8000-000000000003';
const GroupId = '20000000-0000-4000-8000-000000000002';

function broadcastRow(overrides: Record<string, unknown> = {}) {
  return {
    globalId: BroadcastId,
    audience: {
      type: 'ALL' as const,
      groupId: null,
      centerLat: null,
      centerLng: null,
      radiusMeters: null,
    },
    audienceLabel: 'toàn bộ người dùng đang hoạt động',
    notificationType: 'SYSTEM_BROADCAST',
    title: 'Mùa Vu Lan',
    body: 'Chương trình bắt đầu hôm nay.',
    status: 'PENDING' as const,
    audienceCount: 0,
    notifiedCount: 0,
    alreadySentCount: 0,
    failedCount: 0,
    lastUserId: 0,
    failureReason: null,
    createdBy: ActorId,
    createdAt: new Date('2026-10-03T00:00:00Z'),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function makeDeps(
  options: { pending?: unknown; users?: number; created?: boolean } = {},
) {
  const total = options.users ?? 3;
  const users = Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    globalId: `u-${i + 1}`,
  }));

  return {
    broadcasts: {
      create: jest.fn(async (params: Record<string, unknown>) =>
        broadcastRow(params),
      ),
      findByGlobalId: jest.fn(async (_id: string) => broadcastRow()),
      listRecent: jest.fn(async () => ({ items: [], total: 0 })),
      findNextPending: jest.fn(async () =>
        options.pending === undefined ? broadcastRow() : options.pending,
      ),
      markSending: jest.fn(async (_id: string) => undefined),
      recordProgress: jest.fn(async (_p: Record<string, unknown>) => undefined),
      markCompleted: jest.fn(async (_id: string) => undefined),
      markFailed: jest.fn(async (_id: string, _r: string) => undefined),
      countAudience: jest.fn(async () => total),
    },
    audience: {
      findActiveUserIdsAfter: jest.fn(
        async (params: {
          afterId: number;
          limit: number;
          audience?: unknown;
        }) => users.filter((u) => u.id > params.afterId).slice(0, params.limit),
      ),
    },
    dispatch: {
      handle: jest.fn(async (_c: Record<string, unknown>) => ({
        created: options.created !== false,
        pushedDevices: 0,
      })),
    },
    admin: {
      hasPermission: jest.fn(
        async (_u: string, _c: string): Promise<boolean> => true,
      ),
    },
  };
}

function processor(deps: ReturnType<typeof makeDeps>) {
  return new ProcessBroadcastUseCase(
    deps.broadcasts as never,
    deps.audience as never,
    deps.dispatch as never,
  );
}

function creator(deps: ReturnType<typeof makeDeps>) {
  return new CreateBroadcastUseCase(
    deps.broadcasts as never,
    deps.admin as never,
  );
}

describe('CreateBroadcastUseCase', () => {
  const valid = {
    actorUserId: ActorId,
    audience: { type: 'ALL' },
    title: 'Mùa Vu Lan',
    body: 'Chương trình bắt đầu hôm nay.',
  };

  it('chỉ GHI lượt gửi, KHÔNG gửi gì', async () => {
    const deps = makeDeps();

    await creator(deps).handle(valid);

    expect(deps.broadcasts.create).toHaveBeenCalledTimes(1);
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
    expect(deps.audience.findActiveUserIdsAfter).not.toHaveBeenCalled();
  });

  it('cắt khoảng trắng tiêu đề và nội dung', async () => {
    const deps = makeDeps();

    await creator(deps).handle({
      ...valid,
      title: '  Vu Lan  ',
      body: '  Nội dung  ',
    });

    const params = deps.broadcasts.create.mock.calls[0][0] as {
      title: string;
      body: string;
    };
    expect(params.title).toBe('Vu Lan');
    expect(params.body).toBe('Nội dung');
  });

  it('type LẠ bị từ chối, KHÔNG lùi về ALL', async () => {
    // Hướng lùi sai duy nhất: một bộ lọc đọc không ra mà thành "gửi cho tất cả" là gửi
    // cho trăm nghìn người thay vì một nhóm nhỏ.
    const deps = makeDeps();

    await expect(
      creator(deps).handle({ ...valid, audience: { type: 'THEO_HANG' } }),
    ).rejects.toThrow();

    expect(deps.broadcasts.create).not.toHaveBeenCalled();
  });

  it('GROUP thiếu groupId bị từ chối', async () => {
    const deps = makeDeps();

    await expect(
      creator(deps).handle({ ...valid, audience: { type: 'GROUP' } }),
    ).rejects.toThrow();

    expect(deps.broadcasts.create).not.toHaveBeenCalled();
  });

  it('AREA bán kính 0 bị từ chối', async () => {
    const deps = makeDeps();

    await expect(
      creator(deps).handle({
        ...valid,
        audience: {
          type: 'AREA',
          centerLat: 10.7724,
          centerLng: 106.698,
          radiusMeters: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('AREA hợp lệ thì ghi đủ toạ độ và bán kính', async () => {
    const deps = makeDeps();

    await creator(deps).handle({
      ...valid,
      audience: {
        type: 'AREA',
        centerLat: 10.7724,
        centerLng: 106.698,
        radiusMeters: 5_000,
      },
    });

    const params = deps.broadcasts.create.mock.calls[0][0] as {
      audience: { type: string; centerLat: number; radiusMeters: number };
    };
    expect(params.audience).toMatchObject({
      type: 'AREA',
      centerLat: 10.7724,
      radiusMeters: 5_000,
    });
  });

  it('thiếu quyền notification.manage thì không ghi gì', async () => {
    const deps = makeDeps();
    deps.admin.hasPermission.mockResolvedValue(false);

    await expect(creator(deps).handle(valid)).rejects.toThrow();
    expect(deps.broadcasts.create).not.toHaveBeenCalled();
  });

  it('loại thông báo là SYSTEM_BROADCAST', async () => {
    const deps = makeDeps();

    await creator(deps).handle(valid);

    expect(
      (deps.broadcasts.create.mock.calls[0][0] as { notificationType: string })
        .notificationType,
    ).toBe('SYSTEM_BROADCAST');
  });
});

describe('ProcessBroadcastUseCase', () => {
  it('không có lượt gửi nào thì không chạm gì', async () => {
    const deps = makeDeps({ pending: null });

    const result = await processor(deps).handle({});

    expect(result.broadcastId).toBeNull();
    expect(deps.broadcasts.markSending).not.toHaveBeenCalled();
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
  });

  it('gửi hết người nhận rồi đánh dấu xong', async () => {
    const deps = makeDeps({ users: 3 });

    const result = await processor(deps).handle({});

    expect(result.processed).toBe(3);
    expect(result.notified).toBe(3);
    expect(result.completed).toBe(true);
    expect(deps.broadcasts.markCompleted).toHaveBeenCalledWith(BroadcastId);
  });

  it('TIẾP từ con trỏ, không bắt đầu lại', async () => {
    // Khoá chống trùng vẫn chặn gửi lại, nhưng không có con trỏ thì lượt chạy phải đi qua
    // hàng chục nghìn lượt gọi vô ích trước khi tới chỗ còn dở.
    const deps = makeDeps({
      users: 5,
      pending: broadcastRow({ lastUserId: 3 }),
    });

    const result = await processor(deps).handle({});

    expect(
      (
        deps.audience.findActiveUserIdsAfter.mock.calls[0][0] as {
          afterId: number;
        }
      ).afterId,
    ).toBe(3);
    expect(result.processed).toBe(2);
  });

  it('ghi tiến độ SAU MỖI LÔ, không chờ hết vòng', async () => {
    // Mất kết nối ở lô thứ 120 mà chưa ghi gì thì con trỏ vẫn ở 0.
    const deps = makeDeps({ users: 5 });

    await processor(deps).handle({ batchSize: 2 });

    expect(deps.broadcasts.recordProgress).toHaveBeenCalledTimes(3);
    const cursors = deps.broadcasts.recordProgress.mock.calls.map(
      (c) => (c[0] as { lastUserId: number }).lastUserId,
    );
    expect(cursors).toEqual([2, 4, 5]);
  });

  it('truyền bộ người nhận xuống truy vấn', async () => {
    const deps = makeDeps({
      pending: broadcastRow({
        audience: {
          type: 'AREA',
          groupId: null,
          centerLat: 10.7724,
          centerLng: 106.698,
          radiusMeters: 5_000,
        },
      }),
    });

    await processor(deps).handle({});

    expect(
      (
        deps.audience.findActiveUserIdsAfter.mock.calls[0][0] as {
          audience: { type: string };
        }
      ).audience.type,
    ).toBe('AREA');
  });

  it('đã có thông báo từ trước thì đếm alreadySent, không đếm notified', async () => {
    const deps = makeDeps({ users: 2, created: false });

    const result = await processor(deps).handle({});

    expect(result.notified).toBe(0);
    expect(result.alreadySent).toBe(2);
    expect(result.completed).toBe(true);
  });

  it('một người gửi hỏng KHÔNG dừng cả vòng', async () => {
    const deps = makeDeps({ users: 4 });
    let n = 0;
    deps.dispatch.handle.mockImplementation(async () => {
      n += 1;
      if (n === 2) throw new Error('hộp thư đầy');
      return { created: true, pushedDevices: 0 };
    });

    const result = await processor(deps).handle({});

    expect(result.notified).toBe(3);
    expect(result.failed).toBe(1);
    // Vẫn xong: một người hỏng không làm cả lượt gửi thất bại.
    expect(result.completed).toBe(true);
    expect(deps.broadcasts.markFailed).not.toHaveBeenCalled();
  });

  it('lỗi khi ĐỌC lô thì đánh dấu FAILED và ném', async () => {
    // Khác lỗi của một người nhận: tiếp tục trong trạng thái mất database là ghi số liệu
    // sai.
    const deps = makeDeps();
    deps.audience.findActiveUserIdsAfter.mockRejectedValue(
      new Error('connection terminated'),
    );

    await expect(processor(deps).handle({})).rejects.toThrow(
      'connection terminated',
    );

    expect(deps.broadcasts.markFailed).toHaveBeenCalledWith(
      BroadcastId,
      expect.stringContaining('connection terminated'),
    );
    expect(deps.broadcasts.markCompleted).not.toHaveBeenCalled();
  });

  it('dry-run không gửi và không đánh dấu gì', async () => {
    const deps = makeDeps();

    const result = await processor(deps).handle({ dryRun: true });

    expect(result.broadcastId).toBe(BroadcastId);
    expect(result.notified).toBe(0);
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
    expect(deps.broadcasts.markSending).not.toHaveBeenCalled();
  });

  it('nhặt lại lượt gửi đang SENDING — một lượt chạy chết giữa đường', async () => {
    const deps = makeDeps({
      users: 3,
      pending: broadcastRow({ status: 'SENDING', lastUserId: 1 }),
    });

    const result = await processor(deps).handle({});

    expect(result.processed).toBe(2);
    expect(result.completed).toBe(true);
  });

  it('khoá chống trùng gắn id LƯỢT GỬI, không gắn ngày', async () => {
    // Hai lượt gửi khác nhau trong cùng ngày là bình thường; khoá theo ngày chặn lượt
    // thứ hai.
    const deps = makeDeps({ users: 1 });

    await processor(deps).handle({});

    expect(
      (deps.dispatch.handle.mock.calls[0][0] as { idempotencyKey: string })
        .idempotencyKey,
    ).toBe(`BROADCAST:${BroadcastId}:u-1`);
  });

  it('gửi theo nhóm truyền groupId xuống', async () => {
    const deps = makeDeps({
      pending: broadcastRow({
        audience: {
          type: 'GROUP',
          groupId: GroupId,
          centerLat: null,
          centerLng: null,
          radiusMeters: null,
        },
      }),
    });

    await processor(deps).handle({});

    expect(
      (
        deps.audience.findActiveUserIdsAfter.mock.calls[0][0] as {
          audience: { groupId: string };
        }
      ).audience.groupId,
    ).toBe(GroupId);
  });
});
