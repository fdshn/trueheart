import {
  ISettleGiftRewardsResult,
  ISettleGiftRewardsUseCase,
} from '@/application/contracts/review';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { ReviewCliModule } from './review-cli.module';

export async function runSettleGiftRewards(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC, không phải trang trí: `NestFactory` là một instance,
  // nên truyền tham chiếu method trần làm mất `this` và mọi CLI chết ngay ở
  // dòng đầu với "Cannot read properties of undefined". Unit test không thấy
  // vì chúng tiêm sẵn một hàm giả vào đúng tham số này.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = ReviewCliModule,
): Promise<ISettleGiftRewardsResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<ISettleGiftRewardsUseCase>(
      ISettleGiftRewardsUseCase,
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
  const result = await runSettleGiftRewards(dryRun);

  console.log(
    `Ngưỡng đang cấu hình: chờ ${result.graceDays} ngày, ` +
      `áp mặc định ${result.defaultPercent}%.`,
  );

  if (result.pending === 0) {
    console.log('Không lượt trao nào quá hạn chờ mà chưa được trả thưởng.');
    return;
  }

  console.log(`\n${result.pending} lượt trao quá hạn chờ.`);

  if (dryRun) {
    console.log('\n--dry-run: không cộng điểm nào. Bỏ cờ này để trả thưởng.');
    // Thoát khác 0 để cron hay CI coi "có việc tồn" là chuyện cần biết, không
    // phải một lần chạy bình thường.
    process.exitCode = 1;
    return;
  }

  // In TỪNG lượt chứ không chỉ tổng số: một con số "đã trả 12 lượt" không cho
  // ai biết người nào nhận bao nhiêu, và đây là tiền của người dùng.
  for (const reward of result.settled)
    console.log(
      `  ${reward.transactionId} → ${reward.giverId}: ` +
        `+${reward.points}đ (${reward.appliedPercent}%)`,
    );

  const skipped = result.pending - result.settled.length;
  console.log(`\nĐã trả thưởng ${result.settled.length} lượt.`);
  if (skipped > 0)
    console.log(
      `${skipped} lượt KHÔNG cộng được — rule đang tắt, hoặc đã chạm cap ngày.`,
    );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
