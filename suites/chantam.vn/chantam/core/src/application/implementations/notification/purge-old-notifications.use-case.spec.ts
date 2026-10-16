import { NotificationRetentionConfigKey } from '@chantam.vn/chantam.core-lib/models';
import { PurgeOldNotificationsUseCase } from './purge-old-notifications.use-case';

function makeUseCase(options: { config?: unknown; batches?: number[] } = {}) {
  const queue = [...(options.batches ?? [0])];
  const notifications = {
    purgeOlderThan: jest.fn(async () => queue.shift() ?? 0),
  };
  const adminConfig = {
    getConfigValue: jest.fn(async () => options.config),
  };
  return {
    useCase: new PurgeOldNotificationsUseCase(
      notifications as never,
      adminConfig as never,
    ),
    notifications,
    adminConfig,
  };
}

describe('PurgeOldNotificationsUseCase', () => {
  it('đọc hạn lưu trữ từ cấu hình và xoá theo lô 5000', async () => {
    const { useCase, notifications, adminConfig } = makeUseCase({
      config: { retentionDays: 30 },
      batches: [12],
    });

    const result = await useCase.handle();

    expect(adminConfig.getConfigValue).toHaveBeenCalledWith(
      NotificationRetentionConfigKey,
    );
    expect(notifications.purgeOlderThan).toHaveBeenCalledWith({
      olderThanDays: 30,
      limit: 5_000,
    });
    expect(result).toEqual({ purged: 12, hitBatchLimit: false });
  });

  it('chưa có cấu hình thì giữ 90 ngày', async () => {
    const { useCase, notifications } = makeUseCase({ config: null });

    await useCase.handle();

    expect(notifications.purgeOlderThan).toHaveBeenCalledWith(
      expect.objectContaining({ olderThanDays: 90 }),
    );
  });

  it.each([
    [{ retentionDays: 1 }, 7],
    [{ retentionDays: 10_000 }, 365],
    [{ retentionDays: 'abc' }, 90],
    [{ retentionDays: 45.9 }, 45],
  ])('cấu hình %j được kẹp thành %i ngày', async (config, expected) => {
    const { useCase, notifications } = makeUseCase({ config });

    await useCase.handle();

    expect(notifications.purgeOlderThan).toHaveBeenCalledWith(
      expect.objectContaining({ olderThanDays: expected }),
    );
  });

  it('lô đầy thì gọi tiếp, lô thiếu thì dừng và cộng đủ số đã xoá', async () => {
    const { useCase, notifications } = makeUseCase({
      batches: [5_000, 5_000, 1_234],
    });

    const result = await useCase.handle();

    expect(notifications.purgeOlderThan).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ purged: 11_234, hitBatchLimit: false });
  });

  it('lô đầy đúng bằng kích thước thì vẫn gọi thêm một vòng', async () => {
    const { useCase, notifications } = makeUseCase({ batches: [5_000, 0] });

    const result = await useCase.handle();

    expect(notifications.purgeOlderThan).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ purged: 5_000, hitBatchLimit: false });
  });

  it('chạm trần 20 lô thì dừng và báo còn tồn đọng', async () => {
    const { useCase, notifications } = makeUseCase({
      batches: Array.from({ length: 25 }, () => 5_000),
    });

    const result = await useCase.handle();

    expect(notifications.purgeOlderThan).toHaveBeenCalledTimes(20);
    expect(result).toEqual({ purged: 100_000, hitBatchLimit: true });
  });

  it('lô cuối thiếu ở đúng vòng thứ 20 thì không tính là chạm trần', async () => {
    const { useCase } = makeUseCase({
      batches: [...Array.from({ length: 19 }, () => 5_000), 10],
    });

    const result = await useCase.handle();

    expect(result).toEqual({ purged: 95_010, hitBatchLimit: false });
  });
});
