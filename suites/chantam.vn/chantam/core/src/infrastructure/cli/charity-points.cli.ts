import { IProcessCharityPointsUseCase } from '@/application/contracts/charity-project';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { CharityCliModule } from './charity-cli.module';
import { selfCheckIfRequested } from './self-check';

const BatchLimit = 500;

/**
 * Điểm dự án từ thiện (CHARITY-PROJECT-LIFECYCLE §3.9): vá award còn thiếu của lượt giao nhận
 * đã xong, đưa điểm bài đã gỡ/ẩn về 0, ghi tiếp phần đang HOÃN vì trần (ngày mới, Admin nâng
 * trần). Idempotent theo (award, lượt ghi).
 */
export async function runCharityPoints(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC — xem ghi chú ở `selection-auto-select.cli.ts`.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = CharityCliModule,
): Promise<Awaited<ReturnType<IProcessCharityPointsUseCase['handle']>>> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );
  try {
    const useCase = app.get<IProcessCharityPointsUseCase>(
      IProcessCharityPointsUseCase,
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
    await selfCheckIfRequested(CharityCliModule, IProcessCharityPointsUseCase)
  )
    return;

  const dryRun = process.argv.includes('--dry-run');
  const result = await runCharityPoints(dryRun);
  console.log(
    `${dryRun ? '[chạy khô] ' : ''}Vá award: ${result.backfilled} · đưa về 0: ${result.zeroed} · xét: ${result.settled} · ghi: ${result.applied} điểm · còn hoãn: ${result.deferred} điểm.`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
