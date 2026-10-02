import {
  INotifyLunarObservanceResult,
  INotifyLunarObservanceUseCase,
} from '@/application/contracts/lunar';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { LunarCliModule } from './lunar-cli.module';
import { selfCheckIfRequested } from './self-check';

export async function runNotifyLunarObservance(
  dryRun: boolean,
  // `.bind` là BẮT BUỘC, không phải trang trí — xem ghi chú ở
  // `selection-auto-select.cli.ts`: truyền tham chiếu method trần làm mất `this`.
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = LunarCliModule,
): Promise<INotifyLunarObservanceResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<INotifyLunarObservanceUseCase>(
      INotifyLunarObservanceUseCase,
    );
    return await useCase.handle({ dryRun });
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  if (await selfCheckIfRequested(LunarCliModule, INotifyLunarObservanceUseCase))
    return;

  const dryRun = process.argv.includes('--dry-run');
  const result = await runNotifyLunarObservance(dryRun);

  // CHẠY ĐƯỢC MỖI NGÀY. Khoảng 25 ngày mỗi tháng không phải mốc nào, và lượt chạy đó
  // thoát sớm — cron không cần biết lịch âm để đặt ngày.
  if (result.skipped) {
    console.log(
      `Ngày ${result.lunarDate} âm lịch không phải Rằm/Mùng Một và không có ngày lễ. Không gửi gì.`,
    );
    return;
  }

  const what =
    result.holidayName ??
    (result.observance === 'FULL_MOON' ? 'Ngày Rằm' : 'Mùng Một');
  console.log(`Ngày ${result.lunarDate} âm lịch — ${what}.`);

  if (dryRun) {
    console.log('--dry-run: chưa gửi cho ai. Bỏ cờ này để gửi thật.');
    return;
  }

  console.log(
    `  ${result.audience} người đang hoạt động · ${result.notified} đã gửi · ` +
      `${result.alreadySent} đã có từ trước`,
  );

  // `alreadySent` lớn là DẤU HIỆU TỐT khi chạy lại trong cùng ngày: nó nói khoá chống
  // trùng đang làm việc, không phải job gửi trùng.
  if (result.failed > 0) {
    console.error(`  ${result.failed} người KHÔNG gửi được.`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
