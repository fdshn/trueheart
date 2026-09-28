import { PurgeOldNotificationsUseCase } from '@/application/implementations/notification/purge-old-notifications.use-case';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { NotificationCliModule } from './notification-cli.module';

export async function runPurgeOldNotifications(
  // `.bind` là BẮT BUỘC: `NestFactory` là một instance, nên truyền tham chiếu
  // method trần làm mất `this` và CLI chết ngay ở dòng đầu.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = NotificationCliModule,
): Promise<{ purged: number; hitBatchLimit: boolean }> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    return await app.get(PurgeOldNotificationsUseCase).handle();
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  const result = await runPurgeOldNotifications();
  console.log(`Đã dọn ${result.purged} thông báo quá hạn lưu trữ.`);

  // Thoát khác 0 khi còn tồn đọng: người vận hành cần thấy để tăng nhịp chạy,
  // thay vì để job im lặng không bao giờ đuổi kịp.
  if (result.hitBatchLimit) {
    console.error('Vẫn còn thông báo quá hạn chưa dọn — nên chạy lại sớm hơn.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
