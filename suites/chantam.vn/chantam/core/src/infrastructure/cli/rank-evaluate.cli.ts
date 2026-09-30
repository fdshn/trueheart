import { IEvaluateDueRankMaintenanceUseCase } from '@/application/contracts/rank';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { RankEvaluationCliModule } from './rank-evaluation-cli.module';
import { selfCheckIfRequested } from './self-check';

export async function runRankEvaluation(
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = RankEvaluationCliModule,
): Promise<{ processedCycles: number }> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<IEvaluateDueRankMaintenanceUseCase>(
      IEvaluateDueRankMaintenanceUseCase,
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
      RankEvaluationCliModule,
      IEvaluateDueRankMaintenanceUseCase,
    )
  )
    return;

  const result = await runRankEvaluation();
  console.log(`Đã đánh giá ${result.processedCycles} chu kỳ duy trì rank.`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
