import {
  IReconcileGiverAccuracyResult,
  IReconcileGiverAccuracyUseCase,
} from '@/application/contracts/review';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { ReviewCliModule } from './review-cli.module';

export async function runAccuracyReconcile(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC, không phải trang trí: `NestFactory` là một instance,
  // nên truyền tham chiếu method trần làm mất `this` và mọi CLI chết ngay ở
  // dòng đầu với "Cannot read properties of undefined". Unit test không thấy
  // vì chúng tiêm sẵn một hàm giả vào đúng tham số này.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = ReviewCliModule,
): Promise<IReconcileGiverAccuracyResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<IReconcileGiverAccuracyUseCase>(
      IReconcileGiverAccuracyUseCase,
    );
    return await useCase.handle({ dryRun });
  } finally {
    await app.close();
  }
}

function describe(percent: number | null): string {
  return percent === null ? 'chưa công bố' : `${percent}%`;
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  const dryRun = process.argv.includes('--dry-run');
  const result = await runAccuracyReconcile(dryRun);

  console.log(`Đã quét ${result.scanned} hồ sơ có chỉ số hoặc có mẫu.`);

  if (result.drifts.length === 0) {
    console.log('Không hồ sơ nào lệch so với ngưỡng đang cấu hình.');
    return;
  }

  // In từng hồ sơ chứ không chỉ tổng số: một con số "đã sửa 12 hồ sơ" không
  // cho ai biết ai vừa được gỡ cờ và ai vừa bị gắn.
  console.log(`\n${result.drifts.length} hồ sơ lệch:`);
  for (const drift of result.drifts) {
    const flag =
      drift.storedReviewRequired === drift.actualReviewRequired
        ? ''
        : drift.actualReviewRequired
          ? '  [GẮN cờ xem xét]'
          : '  [GỠ cờ xem xét]';
    console.log(
      `  ${drift.userId}: ${describe(drift.storedPercent)}/${drift.storedSamples} mẫu` +
        ` → ${describe(drift.actualPercent)}/${drift.actualSamples} mẫu${flag}`,
    );
  }

  if (dryRun) {
    console.log('\n--dry-run: không sửa gì. Bỏ cờ này để sửa.');
    // Thoát khác 0 để cron hay CI coi lệch là chuyện cần biết.
    process.exitCode = 1;
    return;
  }

  console.log(`\nĐã sửa ${result.repaired} hồ sơ.`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
