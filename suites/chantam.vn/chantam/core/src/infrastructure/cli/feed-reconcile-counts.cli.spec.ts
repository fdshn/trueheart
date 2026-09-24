// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require('node:crypto');
(globalThis as any).crypto = nodeCrypto.webcrypto ?? nodeCrypto;

jest.mock('../config/config.module', () => ({
  ConfigModule: class ConfigModule {},
}));

import { FeedCliModule } from './feed-cli.module';
import { runFeedReconcileCounts } from './feed-reconcile-counts.cli';

function makeApp(result: unknown) {
  const useCase = { handle: jest.fn().mockResolvedValue(result) };
  const app = {
    get: jest.fn().mockReturnValue(useCase),
    close: jest.fn().mockResolvedValue(undefined),
    listen: jest.fn(),
  };
  return { useCase, app };
}

describe('runFeedReconcileCounts', () => {
  it('dựng context, gọi đúng một lần rồi đóng, không mở cổng HTTP', async () => {
    const { useCase, app } = makeApp({ scanned: 12, drifts: [], repaired: 0 });
    const createApplicationContext = jest.fn().mockResolvedValue(app);

    await expect(
      runFeedReconcileCounts(false, createApplicationContext as never, {}),
    ).resolves.toEqual({ scanned: 12, drifts: [], repaired: 0 });

    expect(useCase.handle).toHaveBeenCalledWith({ dryRun: false });
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(app.listen).not.toHaveBeenCalled();
  });

  it('truyền cờ dry-run xuống use case', async () => {
    const { useCase, app } = makeApp({ scanned: 3, drifts: [], repaired: 0 });
    const createApplicationContext = jest.fn().mockResolvedValue(app);

    await runFeedReconcileCounts(true, createApplicationContext as never, {});

    expect(useCase.handle).toHaveBeenCalledWith({ dryRun: true });
  });

  it('dùng module CLI riêng chứ không phải module HTTP', async () => {
    // Nạp cả cây controller thì DocsModule chờ một HTTP app CLI không bao giờ
    // dựng, và tiến trình treo.
    const { app } = makeApp({ scanned: 0, drifts: [], repaired: 0 });
    const createApplicationContext = jest.fn().mockResolvedValue(app);

    await runFeedReconcileCounts(false, createApplicationContext as never);

    expect(createApplicationContext).toHaveBeenCalledWith(FeedCliModule);
  });

  it('đóng context cả khi use case ném lỗi', async () => {
    // Bỏ sót `finally` là để lại một pool kết nối treo mỗi lần cron chạy hỏng.
    const { useCase, app } = makeApp(undefined);
    useCase.handle.mockRejectedValue(new Error('mất kết nối'));
    const createApplicationContext = jest.fn().mockResolvedValue(app);

    await expect(
      runFeedReconcileCounts(false, createApplicationContext as never, {}),
    ).rejects.toThrow('mất kết nối');

    expect(app.close).toHaveBeenCalledTimes(1);
  });
});
