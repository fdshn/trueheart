import { ICompleteDueGiftDeliveriesUseCase } from '@/application/contracts/transaction';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { TransactionCliModule } from './transaction-cli.module';

export async function runGiftAutoCompletion(
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = TransactionCliModule,
): Promise<{ completedTransactions: number; heldForDispute: number }> {
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

  // In ra chứ không im lặng: lượt bị giữ tự khỏi khi Admin đóng báo xấu, nhưng
  // nếu không ai xử thì nó treo vô thời hạn và người vận hành cần thấy con số đó.
  if (result.heldForDispute > 0) {
    console.log(
      `Giữ lại ${result.heldForDispute} lượt vì đang có báo xấu chưa xử.`,
    );
    // Thoát khác 0 để cron coi đây là chuyện cần biết, không phải một lần chạy
    // bình thường.
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
