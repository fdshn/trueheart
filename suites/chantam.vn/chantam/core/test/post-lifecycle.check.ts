/**
 * Chạy vòng đời bài đăng trên Postgres THẬT.
 *
 * Vì sao cần script riêng: unit test của hai use case này mock cả repository,
 * nên không câu SQL nào được thực thi. Toàn bộ phần khó — `FOR UPDATE SKIP
 * LOCKED`, phép biến đổi `jsonb` khi rao vặt thành bài tặng, `make_interval`,
 * và bộ đếm quota loại chính bài đang gia hạn — chỉ lộ ra khi gặp database.
 *
 *   npm run test:lifecycle
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import { PostEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_lifecycle_check';
const AuthorId = '99999999-9999-4999-8999-999999999911';
const OtherId = '99999999-9999-4999-8999-999999999912';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function postId(index: number): string {
  return `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`;
}

interface SeedPost {
  index: number;
  postType: string;
  status: string;
  /** Số ngày tính từ bây giờ; âm là đã quá hạn. `null` là không có hạn. */
  expiresInDays: number | null;
  details?: Record<string, unknown>;
  renewedCount?: number;
  remaining?: number;
  authorId?: string;
}

async function seed(dataSource: DataSource, posts: SeedPost[]): Promise<void> {
  await dataSource.query('DELETE FROM posts');

  for (const post of posts)
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, expires_at, renewed_count)
       VALUES ($1, $2, $3, $4, 'Bài kiểm tra vòng đời',
               'Mô tả đủ dài cho bài kiểm tra vòng đời',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', $5, 1, $6, $7::jsonb,
               CASE WHEN $8::int IS NULL
                    THEN NULL
                    ELSE now() + make_interval(days => $8::int) END,
               $9)`,
      [
        postId(post.index),
        post.postType,
        post.authorId ?? AuthorId,
        CategoryId,
        post.status,
        post.remaining ?? 1,
        JSON.stringify(post.details ?? {}),
        post.expiresInDays,
        post.renewedCount ?? 0,
      ],
    );
}

interface PostRow {
  status: string;
  post_type: string;
  details: Record<string, unknown>;
  renewed_count: number;
  expires_at: Date | null;
}

async function readPost(
  dataSource: DataSource,
  index: number,
): Promise<PostRow> {
  const [row] = await dataSource.query<PostRow[]>(
    `SELECT status, post_type, details, renewed_count, expires_at
     FROM posts WHERE global_id = $1`,
    [postId(index)],
  );
  return row;
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  // Giữ mọi DataSource đã mở để `finally` đóng được hết: một kết nối còn sống
  // là `DROP DATABASE` thất bại, và lỗi thật bị che sau lỗi dọn dẹp.
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

  try {
    for (const [index, userId] of [AuthorId, OtherId].entries())
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE') ON CONFLICT DO NOTHING`,
        [userId, `chutai${index}`],
      );

    const posts = new PostRepository(PostEntity as never, dataSource.manager);

    // ── 1. Vòng quét hết hạn ────────────────────────────────────────────────
    console.log('Vòng quét hết hạn:\n');

    await seed(dataSource, [
      { index: 1, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: -1 },
      { index: 2, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 30 },
      { index: 3, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: null },
      { index: 4, postType: 'OFFER', status: 'RESERVED', expiresInDays: -1 },
      { index: 5, postType: 'OFFER', status: 'DELIVERING', expiresInDays: -1 },
      {
        index: 6,
        postType: 'CLASSIFIED',
        status: 'PUBLISHED',
        expiresInDays: -1,
        details: { price: 250000, condition: 'LIKE_NEW', negotiable: true },
      },
      {
        index: 7,
        postType: 'CLASSIFIED',
        status: 'PUBLISHED',
        expiresInDays: -1,
        details: { condition: 'LIKE_NEW' },
      },
    ]);

    const swept = await posts.expireDuePosts(new Date());
    check(
      'đếm đúng số bài đã đóng và đã chuyển',
      swept.expired === 1 && swept.convertedToOffer === 2,
      JSON.stringify(swept),
    );

    check(
      'bài quá hạn chuyển sang EXPIRED',
      (await readPost(dataSource, 1)).status === 'EXPIRED',
    );
    check(
      'bài chưa tới hạn giữ nguyên PUBLISHED',
      (await readPost(dataSource, 2)).status === 'PUBLISHED',
    );
    check(
      'bài không có hạn không bị đụng tới',
      (await readPost(dataSource, 3)).status === 'PUBLISHED',
    );
    check(
      'bài RESERVED không bị cắt ngang giao dịch đang sống',
      (await readPost(dataSource, 4)).status === 'RESERVED',
    );
    check(
      'bài DELIVERING không bị cắt ngang giao dịch đang sống',
      (await readPost(dataSource, 5)).status === 'DELIVERING',
    );

    const converted = await readPost(dataSource, 6);
    check(
      'rao vặt hết hạn THÀNH bài Muốn Tặng, không biến mất',
      converted.post_type === 'OFFER' && converted.status === 'PUBLISHED',
      `${converted.post_type}/${converted.status}`,
    );
    check(
      'giá đã khai chuyển thành giá trị tham khảo',
      Number(converted.details.estimatedValue) === 250000,
      JSON.stringify(converted.details),
    );
    check(
      'không còn giá bán và cờ thương lượng trên bài tặng',
      !('price' in converted.details) && !('negotiable' in converted.details),
      JSON.stringify(converted.details),
    );
    check(
      'giữ lại tình trạng món đồ khi chuyển loại',
      converted.details.condition === 'LIKE_NEW',
    );
    check(
      'bài chuyển loại được cấp hạn mới, không mang hạn cũ đã quá',
      converted.expires_at !== null &&
        new Date(converted.expires_at).getTime() > Date.now(),
      String(converted.expires_at),
    );

    const convertedNoPrice = await readPost(dataSource, 7);
    check(
      'rao vặt thiếu giá vẫn chuyển được, không đẻ ra estimatedValue rỗng',
      convertedNoPrice.post_type === 'OFFER' &&
        !('estimatedValue' in convertedNoPrice.details),
      JSON.stringify(convertedNoPrice.details),
    );

    const sweptAgain = await posts.expireDuePosts(new Date());
    check(
      'chạy lại vòng quét không đổi gì thêm',
      sweptAgain.expired === 0 && sweptAgain.convertedToOffer === 0,
      JSON.stringify(sweptAgain),
    );

    // ── 2. Gia hạn ──────────────────────────────────────────────────────────
    console.log('\nGia hạn:\n');

    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await seed(dataSource, [
      { index: 10, postType: 'OFFER', status: 'EXPIRED', expiresInDays: -1 },
    ]);
    const first = await posts.renewPost({
      postId: postId(10),
      authorId: AuthorId,
      quota: 3,
      expiresAt: future,
    });
    check(
      'bài đã hết hạn gia hạn được và hiển thị lại',
      first.status === 'RENEWED' && first.post.status === 'PUBLISHED',
      first.status,
    );
    check(
      'bộ đếm gia hạn tăng lên 1',
      Number((await readPost(dataSource, 10)).renewed_count) === 1,
    );

    const second = await posts.renewPost({
      postId: postId(10),
      authorId: AuthorId,
      quota: 3,
      expiresAt: future,
    });
    check(
      'gia hạn lần hai bị chặn',
      second.status === 'LIMIT_REACHED',
      second.status,
    );

    await seed(dataSource, [
      {
        index: 11,
        postType: 'CLASSIFIED',
        status: 'PUBLISHED',
        expiresInDays: 5,
      },
    ]);
    check(
      'tin rao vặt không gia hạn được (nó tự chuyển loại khi hết hạn)',
      (
        await posts.renewPost({
          postId: postId(11),
          authorId: AuthorId,
          quota: 3,
          expiresAt: future,
        })
      ).status === 'NOT_RENEWABLE',
    );

    await seed(dataSource, [
      {
        index: 12,
        postType: 'OFFER',
        status: 'PUBLISHED',
        expiresInDays: 5,
        remaining: 0,
      },
    ]);
    check(
      'bài đã hết vật phẩm không gia hạn được',
      (
        await posts.renewPost({
          postId: postId(12),
          authorId: AuthorId,
          quota: 3,
          expiresAt: future,
        })
      ).status === 'NOT_RENEWABLE',
    );

    await seed(dataSource, [
      {
        index: 13,
        postType: 'OFFER',
        status: 'PUBLISHED',
        expiresInDays: 5,
        authorId: OtherId,
      },
    ]);
    check(
      'bài của người khác trả NOT_FOUND, không lộ là có thật',
      (
        await posts.renewPost({
          postId: postId(13),
          authorId: AuthorId,
          quota: 3,
          expiresAt: future,
        })
      ).status === 'NOT_FOUND',
    );

    // Quota: bài đang PUBLISHED phải được loại khỏi bộ đếm của chính nó.
    await seed(dataSource, [
      { index: 20, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 5 },
      { index: 21, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 5 },
    ]);
    check(
      'bài đang mở không tự chặn mình khi quota vừa đủ',
      (
        await posts.renewPost({
          postId: postId(20),
          authorId: AuthorId,
          quota: 2,
          expiresAt: future,
        })
      ).status === 'RENEWED',
    );

    await seed(dataSource, [
      { index: 30, postType: 'OFFER', status: 'EXPIRED', expiresInDays: -1 },
      { index: 31, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 5 },
      { index: 32, postType: 'OFFER', status: 'PUBLISHED', expiresInDays: 5 },
    ]);
    check(
      'bài hết hạn quay lại rổ quota nên bị chặn khi đã đầy',
      (
        await posts.renewPost({
          postId: postId(30),
          authorId: AuthorId,
          quota: 2,
          expiresAt: future,
        })
      ).status === 'QUOTA_EXCEEDED',
    );
  } finally {
    for (const source of opened)
      if (source.isInitialized) await source.destroy();

    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  console.log(
    failures.length === 0
      ? '\nTất cả bất biến vòng đời đều giữ được.'
      : `\n${failures.length} bất biến bị vi phạm:\n- ${failures.join('\n- ')}`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
