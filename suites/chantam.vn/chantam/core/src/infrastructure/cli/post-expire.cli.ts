import { IExpireDuePostsUseCase } from '@/application/contracts/post';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { PostCliModule } from './post-cli.module';

export async function runPostExpiry(
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext,
  appModule: unknown = PostCliModule,
): Promise<{ expired: number; convertedToOffer: number }> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    const useCase = app.get<IExpireDuePostsUseCase>(IExpireDuePostsUseCase);
    return await useCase.handle({});
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  const result = await runPostExpiry();
  console.log(
    `Đã đóng ${result.expired} bài quá hạn và chuyển ${result.convertedToOffer} tin rao vặt thành bài Muốn Tặng.`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
