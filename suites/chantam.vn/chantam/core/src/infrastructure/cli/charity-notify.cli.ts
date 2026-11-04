import {
  IProcessCharityAnnouncementsResult,
  IProcessCharityAnnouncementsUseCase,
} from '@/application/contracts/charity-project';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { CharityCliModule } from './charity-cli.module';
import { selfCheckIfRequested } from './self-check';

/** Mỗi lượt tối đa bao nhiêu thông báo — cron chạy lại sau ít phút nên không cần xả hết. */
const BatchLimit = 200;

/**
 * Thông báo theo dự án từ thiện (CHARITY-PROJECT-LIFECYCLE §3.10): xếp nhắc 48 giờ trước lúc
 * trao, rồi gửi mọi thông báo đang chờ trong outbox `campaign_announcements` (chuyển giai
 * đoạn, kế hoạch đổi điều quan trọng, tổng kết công khai) tới người tham gia, người góp và
 * người quan tâm. Idempotent theo (thông báo, người nhận).
 */
export async function runCharityNotify(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC — xem ghi chú ở `selection-auto-select.cli.ts`.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = CharityCliModule,
): Promise<IProcessCharityAnnouncementsResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );
  try {
    const useCase = app.get<IProcessCharityAnnouncementsUseCase>(
      IProcessCharityAnnouncementsUseCase,
    );
    return await useCase.handle({ limit: BatchLimit, dryRun });
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  if (
    await selfCheckIfRequested(
      CharityCliModule,
      IProcessCharityAnnouncementsUseCase,
    )
  )
    return;

  const dryRun = process.argv.includes('--dry-run');
  const result = await runCharityNotify(dryRun);
  console.log(
    dryRun
      ? `[chạy khô] ${result.preEventQueued} dự án sắp tới lúc trao sẽ được nhắc. Bỏ --dry-run để gửi.`
      : `Xếp nhắc 48 giờ: ${result.preEventQueued} · thông báo đã xử lý: ${result.processed} · lượt gửi: ${result.notified}.`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
