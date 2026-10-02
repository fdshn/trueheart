import {
  IAutoSelectDueRecipientsResult,
  IAutoSelectDueRecipientsUseCase,
} from '@/application/contracts/gift-request';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { GiftRequestCliModule } from './gift-request-cli.module';
import { selfCheckIfRequested } from './self-check';

export async function runAutoSelectDueRecipients(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC, không phải trang trí: `NestFactory` là một instance,
  // nên truyền tham chiếu method trần làm mất `this` và mọi CLI chết ngay ở
  // dòng đầu với "Cannot read properties of undefined". Unit test không thấy
  // vì chúng tiêm sẵn một hàm giả vào đúng tham số này.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = GiftRequestCliModule,
): Promise<IAutoSelectDueRecipientsResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<IAutoSelectDueRecipientsUseCase>(
      IAutoSelectDueRecipientsUseCase,
    );
    return await useCase.handle({ dryRun });
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  // `--self-check` dựng cây DI rồi thoát, KHÔNG làm việc gì. Cổng kiểm tra sau
  // triển khai dùng nó: sáu CLI ở đây ghi dữ liệu thật, nên chạy nguyên xi trên
  // production là xoá lịch sử chat và hộp thư của người dùng.
  if (
    await selfCheckIfRequested(
      GiftRequestCliModule,
      IAutoSelectDueRecipientsUseCase,
    )
  )
    return;

  const dryRun = process.argv.includes('--dry-run');
  const result = await runAutoSelectDueRecipients(dryRun);

  // Kiểm `skippedByPolicy` TRƯỚC `due === 0`.
  //
  // Lượt dừng theo công tắc cũng trả `due: 0`, nên đọc `due` trước sẽ in "Không bài nào
  // hết đồng hồ" cho một lượt Admin chủ ý tắt — đúng cái lẫn lộn hai tín hiệu mà
  // `skippedByPolicy` sinh ra để tránh. Bắt được 02/10 bằng cách chạy thật sau khi tắt
  // công tắc; không phép kiểm nào của use case thấy, vì lỗi nằm ở CLI.
  if (result.skippedByPolicy) {
    console.log(
      'Bỏ qua: allocation.policy.autoCreateTransaction đang TẮT. ' +
        'Bật lại bằng PUT /admin/config/allocation-policy.',
    );
    return;
  }

  if (result.due === 0) {
    console.log('Không bài nào hết đồng hồ chọn người nhận.');
    return;
  }

  console.log(`${result.due} bài hết đồng hồ chọn người nhận.`);

  // In TỪNG bài chứ không chỉ tổng số: đây là lúc hệ thống quyết hộ người dùng
  // ai được nhận món đồ, và quyết định đó phải tra lại được.
  for (const pick of result.selected)
    console.log(
      `  ${pick.postId} → ${pick.requesterId} ` +
        `(chọn 1 trong ${pick.candidates})` +
        (pick.transactionId ? ` · lượt trao ${pick.transactionId}` : ''),
    );

  if (dryRun) {
    console.log('\n--dry-run: chưa chốt ai. Bỏ cờ này để chọn thật.');
    return;
  }

  console.log(`\nĐã chốt ${result.selected.length} người nhận.`);

  if (result.failed.length > 0) {
    console.error(`\n${result.failed.length} bài KHÔNG chốt được:`);
    for (const failure of result.failed)
      console.error(`  ${failure.postId}: ${failure.reason}`);
    // Thoát khác 0: người xin trên những bài này đang chờ một đồng hồ đã reo.
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
