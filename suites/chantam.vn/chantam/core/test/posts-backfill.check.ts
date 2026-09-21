/**
 * Chạy THẬT đường nâng cấp M2.1: `gift_posts` có dữ liệu -> backfill sang `posts`.
 *
 * Vì sao cần script riêng thay vì một spec thường: backfill chỉ có tác dụng khi
 * `gift_posts` đã có dữ liệu TRƯỚC lúc migration `CreateCanonicalPosts` chạy.
 * CI hiện dựng schema trên database trắng nên câu INSERT chèn đúng 0 dòng —
 * xanh mà không chứng minh được gì. Ở đây migration được chạy làm hai pha, ở
 * giữa là lúc seed dữ liệu cũ.
 *
 * Dùng database nháp riêng, tạo và xoá trong cùng lần chạy, nên không đụng vào
 * database phát triển.
 *
 *   npm run migration:backfill-check
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as migrations from '../src/infrastructure/persistence/migrations';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

/** Migration dựng bảng `posts` và chạy backfill. Mốc chia hai pha. */
const BackfillMigration = 'CreateCanonicalPosts1789900000000';

const ScratchDatabase = 'chantam_backfill_check';

type MigrationClass = new () => unknown;

function orderedMigrations(): MigrationClass[] {
  return (resolveAllEntities(migrations) as MigrationClass[])
    .slice()
    .sort((left, right) => timestampOf(left) - timestampOf(right));
}

function timestampOf(migration: MigrationClass): number {
  return Number(/(\d+)$/.exec(migration.name)?.[1] ?? 0);
}

function makeDataSource(url: string, list: MigrationClass[]): DataSource {
  return new DataSource({
    type: 'postgres',
    url,
    migrations: list as never,
    migrationsTableName: 'migrations',
  });
}

/** Một bài cũ cho MỖI giá trị enum danh mục, để không nhánh CASE nào bị bỏ sót. */
const LegacyCategories = [
  'HOUSEHOLD',
  'CLOTHING',
  'BOOKS',
  'ELECTRONICS',
  'FURNITURE',
  'VEHICLE',
  'MEDICAL',
  'FOOD',
  'NON_MATERIAL',
  'OTHER',
];

const GiverId = '99999999-9999-4999-8999-999999999999';

function legacyRows(): string {
  const rows = LegacyCategories.map((category, index) => {
    const globalId = `10000000-0000-4000-8000-0000000000${String(index + 10).padStart(2, '0')}`;
    return `('${globalId}', 'Bài ${category}', 'Mô tả đủ dài cho bài đăng cũ', '${category}', 'USED', 150000, ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography, 'Quận 1', 'PUBLISHED', 2, 2, '${GiverId}', NULL)`;
  });

  // Hai ca biên: bài đã đóng (không được đặt hạn) và bài đã xoá mềm.
  rows.push(
    `('10000000-0000-4000-8000-000000000098', 'Bài đã hoàn tất', 'Mô tả đủ dài cho bài đăng cũ', 'BOOKS', 'NEW', 0, ST_SetSRID(ST_MakePoint(106.7, 10.77), 4326)::geography, 'Quận 3', 'COMPLETED', 1, 0, '${GiverId}', NULL)`,
  );
  rows.push(
    `('10000000-0000-4000-8000-000000000099', 'Bài đã xoá', 'Mô tả đủ dài cho bài đăng cũ', 'FOOD', 'USED', 1000, ST_SetSRID(ST_MakePoint(106.71, 10.78), 4326)::geography, 'Quận 5', 'PUBLISHED', 1, 1, '${GiverId}', now())`,
  );

  return rows.join(',\n');
}

const failures: string[] = [];

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  OK   ${label}`);
    return;
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  // Giữ mọi kết nối đã mở để `finally` đóng được hết. Còn một kết nối sống là
  // DROP DATABASE thất bại, và lỗi dropdb sẽ CHE MẤT lỗi thật đã làm hỏng pha
  // trước đó.
  const opened: DataSource[] = [];
  const open = async (list: MigrationClass[]): Promise<DataSource> => {
    const dataSource = makeDataSource(scratchUri, list);
    opened.push(dataSource);
    await dataSource.initialize();
    return dataSource;
  };

  const admin = makeDataSource(adminUri, []);
  await admin.initialize();
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);
  await admin.destroy();
  console.log(`Đã tạo database nháp ${ScratchDatabase}`);

  try {
    const all = orderedMigrations();
    const splitAt = all.findIndex((item) => item.name === BackfillMigration);
    if (splitAt < 1)
      throw new Error(`Không tìm thấy migration ${BackfillMigration}`);

    // Pha 1: dựng schema cũ, DỪNG ngay trước migration backfill.
    const before = await open(all.slice(0, splitAt));
    await before.runMigrations();
    console.log(`Pha 1: đã chạy ${splitAt} migration (tới trước backfill)`);

    await before.query(`
      INSERT INTO gift_posts
        (global_id, title, description, category, condition, estimated_value,
         location, area_label, status, total_quantity, remaining_quantity,
         giver_id, deleted_at)
      VALUES
      ${legacyRows()}
    `);
    const [{ count: legacyCount }] = await before.query<{ count: string }[]>(
      'SELECT COUNT(*)::text AS count FROM gift_posts',
    );
    console.log(`Đã seed ${legacyCount} bài đăng cũ`);
    await before.destroy();

    // Pha 2: chạy nốt, backfill gặp dữ liệu thật.
    const after = await open(all);
    await after.runMigrations();
    console.log(`Pha 2: đã chạy nốt ${all.length - splitAt} migration\n`);

    console.log('Kiểm chứng kết quả backfill:');

    const [{ count: migrated }] = await after.query<{ count: string }[]>(
      'SELECT COUNT(*)::text AS count FROM posts',
    );
    check(
      'chép đủ mọi bài cũ, kể cả bài đã xoá mềm',
      migrated === legacyCount,
      `posts=${migrated} gift_posts=${legacyCount}`,
    );

    const orphan = await after.query<{ global_id: string }[]>(`
      SELECT g.global_id FROM gift_posts g
      LEFT JOIN posts p ON p.global_id = g.global_id
      WHERE p.global_id IS NULL
    `);
    check(
      'giữ nguyên global_id nên liên kết cũ không đứt',
      orphan.length === 0,
      orphan.map((row) => row.global_id).join(', '),
    );

    const badCategory = await after.query<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM posts p
      LEFT JOIN categories c ON c.global_id = p.category_id
      WHERE c.global_id IS NULL
    `);
    check(
      'mọi danh mục map sang category có thật',
      badCategory[0].count === '0',
      `${badCategory[0].count} bài trỏ vào danh mục không tồn tại`,
    );

    const distinctCategories = await after.query<{ count: string }[]>(
      'SELECT COUNT(DISTINCT category_id)::text AS count FROM posts',
    );
    check(
      `phân biệt đủ ${LegacyCategories.length} danh mục, không dồn hết vào một`,
      distinctCategories[0].count === String(LegacyCategories.length),
      `chỉ thấy ${distinctCategories[0].count}`,
    );

    const expiryOnClosed = await after.query<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM posts
      WHERE status = 'COMPLETED' AND expires_at IS NOT NULL
    `);
    check(
      'không đặt hạn cho bài đã đóng',
      expiryOnClosed[0].count === '0',
      `${expiryOnClosed[0].count} bài COMPLETED bị đặt hạn`,
    );

    const missingExpiry = await after.query<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM posts
      WHERE status = 'PUBLISHED' AND expires_at IS NULL
    `);
    check(
      'đặt hạn cho mọi bài còn sống',
      missingExpiry[0].count === '0',
      `${missingExpiry[0].count} bài PUBLISHED thiếu hạn`,
    );

    const softDeleted = await after.query<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM posts WHERE deleted_at IS NOT NULL
    `);
    check(
      'giữ nguyên dấu xoá mềm',
      softDeleted[0].count === '1',
      `mong đợi 1, thấy ${softDeleted[0].count}`,
    );

    const details = await after.query<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM posts
      WHERE details->>'condition' IS NULL OR details->>'estimatedValue' IS NULL
    `);
    check(
      'giữ tình trạng và giá trị ước tính trong details',
      details[0].count === '0',
      `${details[0].count} bài mất dữ liệu details`,
    );

    const wrongType = await after.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM posts WHERE post_type <> 'OFFER'`,
    );
    check('mọi bài cũ thành OFFER', wrongType[0].count === '0');
  } finally {
    for (const dataSource of opened)
      if (dataSource.isInitialized) await dataSource.destroy();

    const cleanup = makeDataSource(adminUri, []);
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
    console.log(`\nĐã xoá database nháp ${ScratchDatabase}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} kiểm chứng THẤT BẠI:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('\nBackfill chạy đúng trên dữ liệu thật.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
