import {
  ISendPendingRemindersResult,
  ISendPendingRemindersUseCase,
} from '@/application/contracts/notification';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { NotificationCliModule } from './notification-cli.module';

export async function runSendPendingReminders(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC, không phải trang trí: `NestFactory` là một instance,
  // nên truyền tham chiếu method trần làm mất `this` và mọi CLI chết ngay ở
  // dòng đầu với "Cannot read properties of undefined". Unit test không thấy
  // vì chúng tiêm sẵn một hàm giả vào đúng tham số này.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = NotificationCliModule,
): Promise<ISendPendingRemindersResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<ISendPendingRemindersUseCase>(
      ISendPendingRemindersUseCase,
    );
    return await useCase.handle({ dryRun });
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  const dryRun = process.argv.includes('--dry-run');
  const result = await runSendPendingReminders(dryRun);

  console.log(
    `Cần nhắc: ${result.pendingReview} lượt chờ đánh giá, ` +
      `${result.pendingMaintenance} chu kỳ duy trì sắp hết.`,
  );

  if (result.pendingReview === 0 && result.pendingMaintenance === 0) {
    console.log('Không có lời nhắc nào cần gửi.');
    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: không gửi gì. Bỏ cờ này để nhắc thật.');
    return;
  }

  console.log(
    `\nĐã gửi ${result.reviewReminders} lời nhắc đánh giá ` +
      `và ${result.maintenanceReminders} lời nhắc nhiệm vụ duy trì.`,
  );

  // Chênh lệch là bình thái, không phải lỗi: khoá chống trùng đã chặn những lượt
  // đã nhắc ở lần chạy trước. In ra để người vận hành không tưởng là mất thông
  // báo.
  const skipped =
    result.pendingReview +
    result.pendingMaintenance -
    result.reviewReminders -
    result.maintenanceReminders;
  if (skipped > 0)
    console.log(`${skipped} lượt đã nhắc từ trước, không gửi lại.`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
