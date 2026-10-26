/**
 * Hồ sơ công khai mở rộng trên Postgres THẬT (PR #46 §3).
 *
 * Canh ba thứ unit test mock không thấy:
 * - Ràng buộc của migration: chế độ hiển thị chỉ PRIVATE/PUBLIC, mốc suy nghĩ đi cùng chữ,
 *   ảnh bìa không treo khi không có clip.
 * - Bộ lọc `visibleStatuses` của `findMyPosts` — người ngoài chỉ thấy PUBLISHED/RESERVED.
 * - Mặc định PRIVATE cho tài khoản cũ sau migration.
 *
 *   npm run test:public-profile
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { ListUserPostsUseCase } from '../src/application/implementations/post/list-user-posts.use-case';
import * as entities from '../src/infrastructure/entity';
import { PostEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_public_profile_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';
const Author = '7c000000-0000-4000-8000-000000000001';
const Viewer = '7c000000-0000-4000-8000-000000000002';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function rejects(
  label: string,
  run: () => Promise<unknown>,
  constraint: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không bị chặn');
  } catch (error) {
    const name = (error as { driverError?: { constraint?: string } })
      .driverError?.constraint;
    check(label, name === constraint, String(name));
  }
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
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);

    for (const [id, username, phone] of [
      [Author, 'pp_author', '+84900000001'],
      [Viewer, 'pp_viewer', '+84900000002'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status, full_name, email, phone)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE', 'Tên thật', $3, $4)`,
        [id, username, `${username}@example.com`, phone],
      );

    console.log('1. Ràng buộc của migration');
    const [defaults] = await sql(
      `SELECT email_visibility, phone_visibility FROM users WHERE global_id = $1`,
      [Author],
    );
    check(
      'tài khoản mặc định PRIVATE cả email lẫn SĐT',
      defaults.email_visibility === 'PRIVATE' &&
        defaults.phone_visibility === 'PRIVATE',
    );
    await rejects(
      'chế độ hiển thị ngoài PRIVATE/PUBLIC bị chặn',
      () =>
        sql(
          `UPDATE users SET email_visibility = 'FRIENDS' WHERE global_id = $1`,
          [Author],
        ),
      'CHK_users_email_visibility',
    );
    await rejects(
      'có suy nghĩ mà không có mốc cập nhật bị chặn',
      () =>
        sql(`UPDATE users SET today_thought = 'Bình an' WHERE global_id = $1`, [
          Author,
        ]),
      'CHK_users_today_thought_stamp',
    );
    await rejects(
      'ảnh bìa khi không có clip bị chặn',
      () =>
        sql(
          `UPDATE users SET intro_video_thumbnail_url = 'https://cdn/t.jpeg' WHERE global_id = $1`,
          [Author],
        ),
      'CHK_users_intro_video_thumbnail',
    );
    await sql(
      `UPDATE users SET today_thought = 'Bình an', today_thought_updated_at = now(),
              intro_video_url = 'https://cdn/v.mp4', intro_video_thumbnail_url = 'https://cdn/t.jpeg'
        WHERE global_id = $1`,
      [Author],
    );
    check('ghi đúng cặp thì qua', true);

    console.log('\n2. Bài trên hồ sơ — ai thấy trạng thái nào');
    let seq = 0;
    const addPost = (status: string, deleted = false) => {
      seq += 1;
      return sql(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count, deleted_at, created_at)
         VALUES ($1, 'OFFER', $2, $3, $4, 'Mô tả đủ dài cho bài kiểm hồ sơ',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', $5, 1, 1, '{}'::jsonb, 0,
                 CASE WHEN $6::boolean THEN now() END, now() - ($7 || ' minutes')::interval)`,
        [
          `7d000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
          Author,
          CategoryId,
          `Bài ${status}`,
          status,
          deleted,
          String(100 - seq),
        ],
      );
    };
    await addPost('PUBLISHED');
    await addPost('RESERVED');
    await addPost('COMPLETED');
    await addPost('EXPIRED');
    await addPost('PUBLISHED', true);

    const repository = new PostRepository(
      PostEntity as never,
      dataSource.manager,
    );
    const useCase = new ListUserPostsUseCase(
      {
        findActiveByUsername: async () => ({
          globalId: Author,
          username: 'pp_author',
          fullName: 'Tên thật',
          avatarUrl: null,
          rank: 'MEMBER',
          createdAt: new Date(),
        }),
      } as never,
      repository,
      { listByPostIds: async () => [] } as never,
      { countActiveByPostIds: async () => new Map() } as never,
      { findMyReactions: async () => new Map() } as never,
      {
        storage: { publicBaseUrl: 'https://cdn' },
        geo: { jitterRadiusMeters: 300 },
      } as never,
    );
    const statuses = (result: { posts: { post: { status: string } }[] }) =>
      result.posts
        .map((item) => item.post.status)
        .sort()
        .join(',');

    const asViewer = await useCase.handle({
      username: 'pp_author',
      viewerId: Viewer,
    });
    check(
      'người ngoài chỉ thấy PUBLISHED và RESERVED, không bài đã xoá',
      statuses(asViewer) === 'PUBLISHED,RESERVED' && asViewer.meta.total === 2,
      statuses(asViewer),
    );
    const asGuest = await useCase.handle({
      username: 'pp_author',
      viewerId: null,
    });
    check('khách cũng vậy', statuses(asGuest) === 'PUBLISHED,RESERVED');
    const asOwner = await useCase.handle({
      username: 'pp_author',
      viewerId: Author,
    });
    check(
      'chính chủ thấy mọi bài chưa xoá',
      statuses(asOwner) === 'COMPLETED,EXPIRED,PUBLISHED,RESERVED',
      statuses(asOwner),
    );
    const viewerFiltered = await useCase.handle({
      username: 'pp_author',
      viewerId: Viewer,
      status: 'RESERVED',
    });
    check(
      'người ngoài lọc RESERVED: đúng một bài',
      statuses(viewerFiltered) === 'RESERVED',
    );
    check(
      'vị trí trả ra đã làm nhiễu',
      asViewer.posts.every(
        (item) => (item.post.location as { lat: number }).lat !== 10.7724,
      ),
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Hồ sơ công khai: ràng buộc chế độ hiển thị, mốc suy nghĩ, ảnh bìa đi cùng clip; người ngoài chỉ thấy bài công khai'
        : `${failures.length} phép kiểm thất bại`
    }`,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
