import { IReconcilePhoneRewardsUseCase } from '@/application/contracts/point';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { PointCliModule } from './point-cli.module';

export async function runPhoneRewardReconciliation(
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext,
  appModule: unknown = PointCliModule,
): Promise<{ repairedRewards: number }> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<IReconcilePhoneRewardsUseCase>(
      IReconcilePhoneRewardsUseCase,
    );
    return await useCase.handle({});
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  const result = await runPhoneRewardReconciliation();
  console.log(
    `Đã vá ${result.repairedRewards} phần thưởng xác minh SĐT bị thiếu.`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
