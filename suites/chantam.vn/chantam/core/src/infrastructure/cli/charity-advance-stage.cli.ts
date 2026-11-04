import { IAdvanceCharityStagesUseCase } from '@/application/contracts/charity-project';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { CharityCliModule } from './charity-cli.module';
import { selfCheckIfRequested } from './self-check';

/** Mỗi lượt tối đa bao nhiêu dự án — cron chạy lại sau ít phút nên không cần quét hết một lần. */
const BatchLimit = 500;

/**
 * Ghi xuống giai đoạn của dự án từ thiện đã tới mốc thời gian (Triển khai → Sự kiện trao →
 * Tổng kết). Lượt đọc đã tính đúng giai đoạn kể cả khi job trễ; job này để cột lưu và nhật ký
 * `campaign_stage_events` bắt kịp. Idempotent: chạy lại không ghi gì thêm.
 */
export async function runCharityAdvanceStage(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC — xem ghi chú ở `selection-auto-select.cli.ts`.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = CharityCliModule,
): Promise<{ advanced: number; checked: number }> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );
  try {
    const useCase = app.get<IAdvanceCharityStagesUseCase>(
      IAdvanceCharityStagesUseCase,
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
    await selfCheckIfRequested(CharityCliModule, IAdvanceCharityStagesUseCase)
  )
    return;

  const dryRun = process.argv.includes('--dry-run');
  const result = await runCharityAdvanceStage(dryRun);
  console.log(
    `${dryRun ? '[chạy khô] ' : ''}Đã xét ${result.checked} dự án, chuyển giai đoạn ${result.advanced}.`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
