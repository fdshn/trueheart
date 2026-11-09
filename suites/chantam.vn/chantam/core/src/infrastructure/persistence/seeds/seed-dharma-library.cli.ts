import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  DharmaSutras,
  DharmaTemples,
  seedDharmaLibrary,
} from './full/dharma-library';

/**
 * Nạp thư viện Phật pháp (chùa chiền + kinh sách) vào `dharma_contents`.
 *
 * Khác `seed:full`: đây là nội dung thật, không tạo tài khoản demo nào, nên chạy được trên
 * staging/production mà không cần `SEED_DEMO_DATA`. Idempotent — nội dung đã có (theo id hoặc
 * slug) được giữ nguyên, kể cả bản ban nội dung đã sửa qua CMS.
 *
 *   npm run seed:dharma          # dev (ts-node)
 *   npm run seed:dharma:built    # trong container / server đã build
 */
async function main(): Promise<void> {
  loadEnvFile({ path: '.env.local' });
  loadEnvFile();

  const url = process.env.DATABASE_URI;
  if (!url)
    throw new Error('Thiếu DATABASE_URI. Khai DATABASE_URI trước khi seed.');

  // Không nạp entity: chỉ chạy SQL thô, nên khỏi kéo cả cây entity vào một lệnh nhỏ.
  const dataSource = new DataSource({ type: 'postgres', url });
  await dataSource.initialize();
  try {
    const inserted = await seedDharmaLibrary((sql, params) =>
      dataSource.query(sql, params),
    );
    const total = DharmaSutras.length + DharmaTemples.length;
    console.log(
      `✓ Thư viện Phật pháp: thêm ${inserted}/${total} nội dung (${DharmaSutras.length} kinh, ${DharmaTemples.length} chùa); ${total - inserted} đã có, giữ nguyên.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
