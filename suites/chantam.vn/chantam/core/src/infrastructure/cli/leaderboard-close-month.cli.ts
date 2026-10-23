import {
  ICloseLeaderboardMonthResult,
  ICloseLeaderboardMonthUseCase,
} from '@/application/contracts/leaderboard';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { LeaderboardCliModule } from './leaderboard-cli.module';
import { selfCheckIfRequested } from './self-check';

/**
 * Chốt sổ bảng thành tích tháng. Cron gọi lúc 00:05 ngày 1 giờ Việt Nam, chốt tháng vừa qua.
 *
 * `--month=YYYY-MM` để chạy bù một tháng bị lỡ. Chạy lại cùng tháng không ghi và không gửi gì.
 */
export async function runLeaderboardCloseMonth(
  month: string | undefined,
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = LeaderboardCliModule,
): Promise<ICloseLeaderboardMonthResult> {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    return await app
      .get<ICloseLeaderboardMonthUseCase>(ICloseLeaderboardMonthUseCase)
      .handle({ month });
  } finally {
    await app.close();
  }
}

export function parseMonthArgument(
  argv: readonly string[],
): string | undefined {
  const flag = argv.find((argument) => argument.startsWith('--month='));
  return flag ? flag.slice('--month='.length) : undefined;
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  if (
    await selfCheckIfRequested(
      LeaderboardCliModule,
      ICloseLeaderboardMonthUseCase,
    )
  )
    return;

  const result = await runLeaderboardCloseMonth(
    parseMonthArgument(process.argv),
  );
  for (const board of result.boards)
    console.log(
      `${result.month} ${board.board}: ${
        board.created
          ? `chốt ${board.entries} dòng, ${board.badges} huy hiệu`
          : 'đã chốt từ trước, bỏ qua'
      }`,
    );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
