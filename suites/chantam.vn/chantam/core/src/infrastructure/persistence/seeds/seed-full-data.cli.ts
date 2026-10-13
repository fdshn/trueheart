import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../../entity';
import { seedFullData } from './full/seed-full-data';
import { DemoPassword, ensureDemoSeedAllowed } from './seed-demo-data';

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  ensureDemoSeedAllowed(process.env.SEED_DEMO_DATA);

  const url = process.env.DATABASE_URI;
  if (!url)
    throw new Error(
      'Thiếu DATABASE_URI. Chạy trong Core container hoặc khai DATABASE_URI trước khi seed.',
    );

  const dataSource = new DataSource({
    type: 'postgres',
    url,
    entities: resolveAllEntities(entities),
  });
  await dataSource.initialize();

  try {
    await seedFullData(dataSource, (line) => console.log(line));
    console.log(`\nMật khẩu chung của mọi tài khoản demo: ${DemoPassword}`);
    console.log(
      'CẢNH BÁO: demo-quan-tri có vai trò SUPER_ADMIN. Đừng seed lên môi trường mà người ngoài vào được.',
    );
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
