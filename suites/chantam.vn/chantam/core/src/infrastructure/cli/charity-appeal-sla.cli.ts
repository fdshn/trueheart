import { IProcessCharityAppealSlaUseCase } from '@/application/contracts/charity-project';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { CharityCliModule } from './charity-cli.module';
import { selfCheckIfRequested } from './self-check';

const BatchLimit = 200;

/**
 * Hạn khiếu nại (CHARITY-PROJECT-LIFECYCLE §3.16): ban tổ chức quá M ngày → tự chuyển Admin;
 * người khiếu nại im lặng quá K ngày sau quyết định tầng 1 → đóng.
 */
export async function runCharityAppealSla(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC — xem ghi chú ở `selection-auto-select.cli.ts`.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = CharityCliModule,
): Promise<Awaited<ReturnType<IProcessCharityAppealSlaUseCase['handle']>>> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );
  try {
    const useCase = app.get<IProcessCharityAppealSlaUseCase>(
      IProcessCharityAppealSlaUseCase,
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
      IProcessCharityAppealSlaUseCase,
    )
  )
    return;

  const dryRun = process.argv.includes('--dry-run');
  const result = await runCharityAppealSla(dryRun);
  console.log(
    `${dryRun ? '[chạy khô] ' : ''}Quá hạn: ${result.overdue} · chuyển Admin: ${result.escalated} · tự đóng: ${result.autoClosed}.`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
