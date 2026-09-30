import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/** Cờ bật chế độ tự kiểm. */
export const SelfCheckFlag = '--self-check';

/**
 * Dựng cây DI rồi thoát, KHÔNG làm việc gì.
 *
 * ## Vì sao cần
 *
 * `scripts/smoke-cli.sh` chạy thật cả 12 CLI và bắt được `post:expire` chết vì
 * `PostModule` thiếu `GiftRequestModule`. Nhưng nó KHÔNG chạy được trên production:
 * sáu CLI trong danh sách ghi dữ liệu thật — `chat-purge` xoá lịch sử chat,
 * `notification-purge` xoá hộp thư. Một cổng kiểm tra sau triển khai mà xoá dữ liệu
 * người dùng thì tệ hơn không có cổng nào.
 *
 * Nhưng đúng thứ cần bắt lại không cần chạy việc: hai cái bẫy từng làm cả bảy CLI
 * chết đều nằm ở **lúc khởi động** — tham số mặc định `.bind(NestFactory)`, và
 * `@Global()` chỉ có hiệu lực SAU KHI được import ở đâu đó. Cả hai hiện ngay khi
 * `createApplicationContext` dựng cây.
 *
 * Nên `--self-check` dựng cây, giải đúng token mà CLI sẽ dùng, rồi thoát 0. Không
 * đọc, không ghi, không đụng bảng nào.
 *
 * ## Vì sao giải cả TOKEN, không chỉ dựng cây
 *
 * Dựng cây bắt được module thiếu. Giải token còn bắt được chuyện khác: use case có
 * đúng trong module đó không, và `Symbol` dùng ở CLI có trùng `Symbol` mà module
 * provide không. Hai lỗi khác nhau, và cái thứ hai im lặng hơn.
 */
export async function runSelfCheck(
  appModule: unknown,
  token: unknown,
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
): Promise<void> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    // `get` ném nếu token không giải được — đó chính là tín hiệu cần.
    app.get(token as never);
  } finally {
    await app.close();
  }
}

/**
 * Chạy tự kiểm nếu có cờ, và cho nơi gọi biết đã xử lý hay chưa.
 *
 * Mỗi `main()` chỉ cần hai dòng:
 *
 * ```ts
 * if (await selfCheckIfRequested(ChatCliModule, IPurgeExpiredChatsUseCase)) return;
 * ```
 *
 * Trả `boolean` thay vì tự `process.exit`: thoát cứng ở đây bỏ qua mọi `finally`
 * của nơi gọi, và một CLI đóng kết nối trong `finally` sẽ để lại kết nối treo.
 */
export async function selfCheckIfRequested(
  appModule: unknown,
  token: unknown,
): Promise<boolean> {
  if (!process.argv.includes(SelfCheckFlag)) return false;

  await runSelfCheck(appModule, token);
  console.log('Tự kiểm đạt: cây DI dựng được và token giải được.');

  return true;
}
