import {
  IReconcileMilestoneRewardsResult,
  IReconcileMilestoneRewardsUseCase,
} from '@/application/contracts/point';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { PointCliModule } from './point-cli.module';
import { selfCheckIfRequested } from './self-check';

export async function runMilestoneRewardReconciliation(
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = PointCliModule,
): Promise<IReconcileMilestoneRewardsResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<IReconcileMilestoneRewardsUseCase>(
      IReconcileMilestoneRewardsUseCase,
    );
    return await useCase.handle({});
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  // `--self-check` dựng cây DI rồi thoát, KHÔNG làm việc gì. Cổng kiểm tra sau
  // triển khai dùng nó: sáu CLI ở đây ghi dữ liệu thật, nên chạy nguyên xi trên
  // production là xoá lịch sử chat và hộp thư của người dùng.
  if (
    await selfCheckIfRequested(
      PointCliModule,
      IReconcileMilestoneRewardsUseCase,
    )
  )
    return;

  const result = await runMilestoneRewardReconciliation();
  const total =
    result.repairedRewards +
    result.repairedOnboarding +
    result.repairedReferrals;

  console.log(
    `Đã vá ${result.repairedRewards} thưởng xác minh SĐT, ` +
      `${result.repairedOnboarding} thưởng hoàn tất onboarding, ` +
      `và ${result.repairedReferrals} lượt giới thiệu đang treo.`,
  );
  if (total === 0) console.log('Không có mốc nào bị treo phần thưởng.');
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
