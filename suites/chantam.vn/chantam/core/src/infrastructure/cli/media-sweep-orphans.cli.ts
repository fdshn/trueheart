import { ISweepOrphanMediaUseCase } from '@/application/contracts/media';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnvFile } from 'dotenv';
import { MediaCliModule } from './media-cli.module';

export async function runMediaSweepOrphans(
  options: { dryRun?: boolean; minAgeHours?: number } = {},
  createApplicationContext: typeof NestFactory.createApplicationContext = NestFactory.createApplicationContext.bind(
    NestFactory,
  ),
  appModule: unknown = MediaCliModule,
) {
  const app: INestApplicationContext = await createApplicationContext(
    appModule as never,
  );

  try {
    return await app
      .get<ISweepOrphanMediaUseCase>(ISweepOrphanMediaUseCase)
      .handle({
        // Mặc định KHÔNG xoá. Job này xoá dữ liệu không hoàn tác được, và danh
        // sách nguồn key thiếu một dòng là xoá sạch ảnh của cả một phân hệ.
        dryRun: options.dryRun ?? true,
        minAgeHours: options.minAgeHours,
      });
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  const apply = process.argv.includes('--apply');
  const ageArg = process.argv.find((arg) => arg.startsWith('--min-age-hours='));

  const result = await runMediaSweepOrphans({
    dryRun: !apply,
    minAgeHours: ageArg ? Number(ageArg.split('=')[1]) : undefined,
  });

  console.log(
    `Quét ${result.scanned} object (${result.liveKeys} key đang dùng). ` +
      `${result.orphans} mồ côi, ${Math.round(result.reclaimedBytes / 1024)} KB. ` +
      (result.dryRun
        ? 'CHƯA xoá gì — thêm --apply để xoá thật.'
        : `Đã xoá ${result.deleted}.`),
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
