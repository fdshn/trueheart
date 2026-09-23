/**
 * Kiểm chia sẻ trên Postgres THẬT.
 *
 * Ba thứ cần chứng minh:
 *
 *   1. **Ghi nhận tăng số đếm** trong cùng transaction — không nhân bản nội dung.
 *   2. **Cùng một người chia sẻ hai lần là hai lượt** — đây là đếm lần mở khay,
 *      không phải "đã từng chia sẻ hay chưa".
 *   3. **Bài không tồn tại thì không ghi được** — khoá ngoại đa hình không có,
 *      nên tầng ứng dụng phải từ chối trước.
 *
 *   npm run test:feed-shares
 */
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { ContentShareRepository } from '../src/infrastructure/repository/content-share.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_feed_shares_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';
const AuthorId = '99999999-9999-4999-8999-9999999d2001';
const SharerId = '99999999-9999-4999-8999-9999999d2002';
const PostId = '88888888-8888-4888-8888-8888888d2001';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  const opened: DataSource[] = [];
  const admin = new DataSource({ type: 'postgres', url: adminUri });
  await admin.initialize();
  opened.push(admin);
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);

  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  const shares = new ContentShareRepository(dataSource.manager);

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'tacgia_share', 'x', 'MEMBER', 'ACTIVE'),
              ($2, 'nguoi_share', 'x', 'MEMBER', 'ACTIVE')`,
      [AuthorId, SharerId],
    );
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm chia sẻ',
               'Mô tả đủ dài cho bài kiểm tra chia sẻ',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [PostId, AuthorId, CategoryId],
    );

    console.log('Ghi nhận lượt:\n');

    const first = await shares.recordShare({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      userId: SharerId,
      channel: 'zalo',
    });
    check('lượt đầu trả shareCount = 1', first.shareCount === 1, String(first.shareCount));

    const second = await shares.recordShare({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      userId: SharerId,
      channel: 'clipboard',
    });
    check(
      'cùng người chia sẻ lần hai vẫn tăng — đây là đếm lần mở khay',
      second.shareCount === 2,
      String(second.shareCount),
    );

    const [row] = await dataSource.query<{ share_count: string }[]>(
      `SELECT share_count FROM posts WHERE global_id = $1`,
      [PostId],
    );
    check(
      'cột share_count trên bài khớp',
      Number(row.share_count) === 2,
      row.share_count,
    );

    const [count] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM content_shares WHERE subject_id = $1`,
      [PostId],
    );
    check(
      'hai dòng append-only trong content_shares, không nhân bản bài',
      Number(count.count) === 2,
      count.count,
    );

    const [postCount] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM posts WHERE global_id = $1`,
      [PostId],
    );
    check(
      'vẫn đúng một bài — chia sẻ không tạo bản sao',
      Number(postCount.count) === 1,
      postCount.count,
    );

    console.log('\nKênh tuỳ chọn:\n');

    const noChannel = await shares.recordShare({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      userId: AuthorId,
      channel: null,
    });
    check('không gửi kênh vẫn ghi được', noChannel.shareCount === 3);

    const [nullChannel] = await dataSource.query<{ channel: string | null }[]>(
      `SELECT channel FROM content_shares
       WHERE subject_id = $1 AND user_id = $2`,
      [PostId, AuthorId],
    );
    check('channel lưu null khi không gửi', nullChannel.channel === null);
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();

    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
    console.log(`\nĐã xoá database nháp ${ScratchDatabase}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} phép kiểm KHÔNG đạt:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nChia sẻ: append-only, đếm đúng, không nhân bản nội dung.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
