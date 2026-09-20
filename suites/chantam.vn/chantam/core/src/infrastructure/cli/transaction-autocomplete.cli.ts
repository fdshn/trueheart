import { ICompleteDueGiftDeliveriesUseCase } from '@/application/contracts/transaction';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { TransactionCliModule } from './transaction-cli.module';

export async function runGiftAutoCompletion(
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext,
  appModule: unknown = TransactionCliModule,
): Promise<{ completedTransactions: number }> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<ICompleteDueGiftDeliveriesUseCase>(
      ICompleteDueGiftDeliveriesUseCase,
    );
    return await useCase.handle({});
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  const result = await runGiftAutoCompletion();
  console.log(
    `Đã tự hoàn tất ${result.completedTransactions} lượt trao quá hạn.`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
