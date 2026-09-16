import { config as loadEnvFile } from 'dotenv';
import { Client } from 'pg';
import { ensureDemoSeedAllowed, seedDemoData } from './seed-demo-data';

async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  ensureDemoSeedAllowed(process.env.SEED_DEMO_DATA);

  const databaseUri = process.env.DATABASE_URI;

  if (!databaseUri)
    throw new Error(
      'Thiếu DATABASE_URI. Chạy trong Core container hoặc khai DATABASE_URI trước khi seed.',
    );

  const client = new Client({ connectionString: databaseUri });

  await client.connect();

  try {
    await seedDemoData(client);
    console.log(
      'Đã seed 3 user demo, 4 bài đăng demo và 3 phiên demo đã thu hồi.',
    );
    console.log(
      'Tài khoản: demo-nguoi-tang / demo-nguoi-nhan / demo-kiem-duyet',
    );
    console.log('Mật khẩu: Demo@12345');
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
