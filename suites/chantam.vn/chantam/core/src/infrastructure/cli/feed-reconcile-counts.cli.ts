import {
  IReconcileFeedCountsResult,
  IReconcileFeedCountsUseCase,
} from '@/application/contracts/feed';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { FeedCliModule } from './feed-cli.module';

export async function runFeedReconcileCounts(
  dryRun: boolean,
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext,
  appModule: unknown = FeedCliModule,
): Promise<IReconcileFeedCountsResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<IReconcileFeedCountsUseCase>(
      IReconcileFeedCountsUseCase,
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
  const result = await runFeedReconcileCounts(dryRun);

  console.log(`Đã quét ${result.scanned} chủ thể.`);

  if (result.drifts.length === 0) {
    console.log('Không có số đếm nào lệch.');
    return;
  }

  // In từng chỗ lệch chứ không chỉ tổng số: một con số "đã sửa 12 chỗ" không
  // cho ai biết đường ghi nào đang hỏng.
  console.log(`\n${result.drifts.length} chỗ lệch:`);
  for (const drift of result.drifts)
    console.log(
      `  ${drift.subject} ${drift.subjectId} ${drift.column}: ` +
        `lưu ${drift.stored} / thật ${drift.actual}`,
    );

  if (dryRun) {
    console.log('\n--dry-run: không sửa gì. Bỏ cờ này để sửa.');
    // Thoát khác 0 để cron hay CI coi lệch là chuyện cần biết, không phải
    // một lần chạy bình thường.
    process.exitCode = 1;
    return;
  }

  console.log(`\nĐã sửa ${result.repaired} chỗ.`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
