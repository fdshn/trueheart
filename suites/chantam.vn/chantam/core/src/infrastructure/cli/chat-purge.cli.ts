import { IPurgeExpiredChatsUseCase } from '@/application/contracts/chat';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { ChatCliModule } from './chat-cli.module';
import { selfCheckIfRequested } from './self-check';

export async function runChatPurge(
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = ChatCliModule,
): Promise<{ purgedRooms: number; purgedMessages: number }> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<IPurgeExpiredChatsUseCase>(
      IPurgeExpiredChatsUseCase,
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
  if (await selfCheckIfRequested(ChatCliModule, IPurgeExpiredChatsUseCase))
    return;

  const result = await runChatPurge();
  console.log(
    `Đã xoá ${result.purgedMessages} tin nhắn của ${result.purgedRooms} phòng quá hạn lưu trữ.`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
