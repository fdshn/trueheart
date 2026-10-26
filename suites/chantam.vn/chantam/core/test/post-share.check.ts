/**
 * Mã chia sẻ bài trên Postgres THẬT (PR #46 §4).
 *
 * - Bài tạo bằng INSERT thô (không nêu cột) vẫn có mã, đúng bảng chữ và độ dài của core-lib.
 * - Bài có từ TRƯỚC migration được backfill mã; gỡ migration rồi chạy lại vẫn đúng.
 * - Mã duy nhất (chỉ mục UNIQUE từ chối mã trùng).
 * - Tra theo mã dùng đúng ngưỡng xem của `findPublicByGlobalId`.
 *
 *   npm run test:post-share
 */
import {
  PostShareCodeLength,
  PostShareCodePattern,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import { PostEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_post_share_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';
const Owner = '7c100000-0000-4000-8000-000000000001';
const Stranger = '7c100000-0000-4000-8000-000000000002';
const Published = '7c200000-0000-4000-8000-000000000001';
const Draft = '7c200000-0000-4000-8000-000000000002';
const Rejected = '7c200000-0000-4000-8000-000000000003';
const Deleted = '7c200000-0000-4000-8000-000000000004';
const BeforeMigration = '7c200000-0000-4000-8000-000000000005';

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
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);
    for (const [id, username] of [
      [Owner, 'ps_owner'],
      [Stranger, 'ps_stranger'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );
    const addPost = (id: string, status: string) =>
      sql(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count)
         VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm mã chia sẻ', 'Mô tả đủ dài cho bài kiểm mã chia sẻ',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', $4, 1, 1, '{}'::jsonb, 0)`,
        [id, Owner, CategoryId, status],
      );
    const codeOf = async (id: string): Promise<string | null> => {
      const [row] = await sql(
        `SELECT share_code FROM posts WHERE global_id = $1`,
        [id],
      );
      return row?.share_code ?? null;
    };

    console.log('1. Sinh mã và backfill');
    await dataSource.undoLastMigration();
    await addPost(BeforeMigration, 'PUBLISHED');
    await dataSource.runMigrations();
    const backfilled = await codeOf(BeforeMigration);
    check(
      'bài có từ trước migration được backfill mã đúng dạng',
      backfilled !== null && PostShareCodePattern.test(backfilled),
      String(backfilled),
    );

    await addPost(Published, 'PUBLISHED');
    await addPost(Draft, 'DRAFT');
    await addPost(Rejected, 'REJECTED');
    await addPost(Deleted, 'PUBLISHED');
    await sql(`UPDATE posts SET deleted_at = now() WHERE global_id = $1`, [
      Deleted,
    ]);
    const published = (await codeOf(Published)) ?? '';
    check(
      `INSERT không nêu cột vẫn có mã ${PostShareCodeLength} ký tự đúng bảng chữ`,
      PostShareCodePattern.test(published),
      published,
    );

    const [sample] = await sql(
      `SELECT count(*)::int AS total, count(DISTINCT code)::int AS distinct_codes,
              bool_and(code ~ '^[A-HJKMNP-Z2-9]{10}$') AS all_valid
         FROM (SELECT gen_post_share_code() AS code
                 FROM generate_series(1, 20000)) generated`,
    );
    check(
      '20.000 mã sinh liền nhau: đúng dạng và không trùng',
      sample.all_valid === true && sample.distinct_codes === sample.total,
      `${sample.distinct_codes}/${sample.total}`,
    );

    let duplicateRejected = false;
    try {
      await sql(`UPDATE posts SET share_code = $1 WHERE global_id = $2`, [
        published,
        Draft,
      ]);
    } catch (error) {
      duplicateRejected = (error as { code?: string }).code === '23505';
    }
    check('mã trùng bị chỉ mục UNIQUE từ chối', duplicateRejected);

    const posts = new PostRepository(PostEntity as never, dataSource.manager);
    const viaUseCasePath = [
      '7c200000-0000-4000-8000-000000000006',
      '7c200000-0000-4000-8000-000000000007',
    ];
    for (const globalId of viaUseCasePath)
      await posts.createPostWithinQuota(Owner, 100, {
        globalId,
        postType: 'OFFER' as never,
        authorId: Owner,
        categoryId: CategoryId,
        title: 'Bài tạo qua đường use case',
        description: 'Mô tả đủ dài cho bài tạo qua đường use case',
        location: { lat: 10.7724, lng: 106.698 },
        areaLabel: 'Quận 1',
        status: 'PUBLISHED' as never,
        totalQuantity: 1,
        remainingQuantity: 1,
        details: {},
        expiresAt: null,
        renewedCount: 0,
        reactionCount: 0,
        commentCount: 0,
        shareCount: 0,
        isSos: false,
        deliveryMethod: null,
        shipPayer: null,
        charityTransferStatus: null,
        charityTransferRequestedAt: null,
        charityTransferNote: null,
        selectionMode: 'OPTIMAL' as never,
        selectionDeadline: null,
        deletedAt: null,
      });
    const [first, second] = await Promise.all(viaUseCasePath.map(codeOf));
    check(
      'hai bài tạo qua createPostWithinQuota có hai mã khác nhau, đúng dạng',
      first !== second &&
        PostShareCodePattern.test(first ?? '') &&
        PostShareCodePattern.test(second ?? ''),
      `${first} / ${second}`,
    );

    console.log('\n2. Tra theo mã — cùng ngưỡng xem với chi tiết bài');
    const find = async (id: string, viewer?: string) => {
      const post = await posts.findPublicByShareCode(
        (await codeOf(id)) ?? '',
        viewer,
      );
      return post?.globalId ?? null;
    };
    check(
      'bài công khai: khách chưa đăng nhập mở được',
      (await find(Published)) === Published,
    );
    check(
      'bài nháp: người lạ không mở được, chủ bài thì được',
      (await find(Draft, Stranger)) === null &&
        (await find(Draft, Owner)) === Draft,
    );
    check(
      'bài bị gỡ: người lạ không mở được',
      (await find(Rejected, Stranger)) === null,
    );
    check(
      'bài đã xoá: không ai mở được, kể cả chủ bài',
      (await find(Deleted, Owner)) === null,
    );
    check(
      'mã không tồn tại: null',
      (await posts.findPublicByShareCode('ZZZZZZZZZZ')) === null,
    );
    const [shareCount] = await sql(
      `SELECT share_count FROM posts WHERE global_id = $1`,
      [Published],
    );
    check('tra theo mã không tăng share_count', shareCount.share_count === 0);
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
        ? 'Mã chia sẻ: Postgres sinh cho mọi lối tạo bài kể cả bài cũ, duy nhất, tra theo mã giữ đúng quyền xem'
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
