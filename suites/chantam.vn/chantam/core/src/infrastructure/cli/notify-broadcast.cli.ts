import {
  IProcessBroadcastResult,
  IProcessBroadcastUseCase,
} from '@/application/contracts/notification';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { NotificationCliModule } from './notification-cli.module';
import { selfCheckIfRequested } from './self-check';

export async function runProcessBroadcast(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC — xem ghi chú ở `selection-auto-select.cli.ts`.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = NotificationCliModule,
): Promise<IProcessBroadcastResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<IProcessBroadcastUseCase>(IProcessBroadcastUseCase);
    return await useCase.handle({ dryRun });
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  if (
    await selfCheckIfRequested(NotificationCliModule, IProcessBroadcastUseCase)
  )
    return;

  const dryRun = process.argv.includes('--dry-run');
  const result = await runProcessBroadcast(dryRun);

  // Không có lượt gửi nào còn dở là trạng thái BÌNH THƯỜNG của hầu hết lượt chạy — cron
  // gọi mỗi vài phút, mà Admin gửi hàng loạt thì rất thưa.
  if (result.broadcastId === null) {
    console.log('Không có lượt gửi hàng loạt nào đang chờ.');
    return;
  }

  console.log(`Lượt gửi ${result.broadcastId} → ${result.audienceLabel}`);

  if (dryRun) {
    console.log('--dry-run: chưa gửi cho ai. Bỏ cờ này để gửi thật.');
    return;
  }

  console.log(
    `  ${result.processed} người đã xử lý · ${result.notified} đã gửi · ` +
      `${result.alreadySent} đã có từ trước · ${result.failed} lỗi`,
  );

  // MỘT lượt chạy làm MỘT lượt gửi. Chưa xong thì lượt chạy sau tiếp từ con trỏ — in rõ
  // để người đọc log không tưởng job đã kết thúc công việc.
  if (!result.completed) {
    console.log('  Chưa xong — lượt chạy sau sẽ tiếp từ con trỏ.');
    return;
  }

  console.log('  Đã xong lượt gửi này.');

  if (result.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
