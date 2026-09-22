// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require('node:crypto');
(globalThis as any).crypto = nodeCrypto.webcrypto ?? nodeCrypto;

// ConfigModule validate biến môi trường ngay lúc nạp, mà jest chạy với
// NODE_ENV=test — không nằm trong danh sách hợp lệ của service.
jest.mock('../config/config.module', () => ({
  ConfigModule: class ConfigModule {},
}));

import { ICompleteDueGiftDeliveriesUseCase } from '@/application/contracts/transaction';
import { runGiftAutoCompletion } from './transaction-autocomplete.cli';
import { TransactionCliModule } from './transaction-cli.module';

describe('runGiftAutoCompletion', () => {
  it('chạy đúng một lần rồi đóng context, không mở cổng HTTP', async () => {
    // Treo context là job cron ngoài không bao giờ kết thúc; mở cổng HTTP là
    // CLI tranh cổng với service đang chạy.
    const close = jest.fn(async () => undefined);
    const useCase = {
      handle: jest.fn(async () => ({ completedTransactions: 4 })),
    };
    const createContext = jest.fn(async () => ({
      get: jest.fn(() => useCase),
      close,
    }));

    await expect(
      runGiftAutoCompletion(createContext as never),
    ).resolves.toEqual({ completedTransactions: 4 });

    expect(useCase.handle).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('dùng module CLI riêng chứ không nạp cả cây controller', async () => {
    // Nạp ControllerModule kéo theo DocsModule, mà nó chờ một HTTP app CLI
    // không bao giờ dựng — tiến trình treo vĩnh viễn.
    const createContext = jest.fn(async () => ({
      get: jest.fn(() => ({
        handle: async () => ({ completedTransactions: 0 }),
      })),
      close: jest.fn(async () => undefined),
    }));

    await runGiftAutoCompletion(createContext as never);

    expect(createContext).toHaveBeenCalledWith(TransactionCliModule);
  });

  it('đóng context ngay cả khi use case ném lỗi', async () => {
    const close = jest.fn(async () => undefined);
    const createContext = jest.fn(async () => ({
      get: jest.fn(() => ({
        handle: async () => {
          throw new Error('database sập');
        },
      })),
      close,
    }));

    await expect(
      runGiftAutoCompletion(createContext as never),
    ).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('lấy use case qua token DI chứ không tự dựng', async () => {
    const get = jest.fn(() => ({
      handle: async () => ({ completedTransactions: 0 }),
    }));
    const createContext = jest.fn(async () => ({
      get,
      close: jest.fn(async () => undefined),
    }));

    await runGiftAutoCompletion(createContext as never);

    expect(get).toHaveBeenCalledWith(ICompleteDueGiftDeliveriesUseCase);
  });
});
