import { IPurgeExpiredChatsUseCase } from '@/application/contracts/chat';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { ChatCliModule } from './chat-cli.module';

export async function runChatPurge(
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext,
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
