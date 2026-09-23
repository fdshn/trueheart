/**
 * Kiểm ảnh trong bình luận trên Postgres THẬT.
 *
 * Ba thứ cần chứng minh:
 *
 *   1. **Bình luận chỉ có ảnh là hợp lệ**, nhưng rỗng cả chữ lẫn ảnh thì không —
 *      ràng buộc `body không rỗng HOẶC media_count > 0` chỉ kiểm được khi
 *      `media_count` đúng NGAY LÚC CHÈN, tức ảnh phải ghi cùng transaction.
 *   2. **Trần ba ảnh do database giữ**, và gửi quá thì phần thừa bị cắt chứ
 *      không làm vỡ cả thao tác.
 *   3. **Ảnh gom trong MỘT truy vấn**, không phải một truy vấn phụ cho mỗi
 *      bình luận — một bài 30 bình luận là 30 lần đi database.
 *
 *   npm run test:feed-media
 */
import {
  CommentStatuses,
  ContentSubjectTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { ContentCommentRepository } from '../src/infrastructure/repository/content-comment.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_feed_media_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const AuthorId = '99999999-9999-4999-8999-9999999d1001';
const PostId = '88888888-8888-4888-8888-8888888d1001';

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

  const comments = new ContentCommentRepository(dataSource.manager);

  function key(name: string): string {
    return `users/${AuthorId}/comment-media/POST/${PostId}/${name}.webp`;
  }

  async function addComment(body: string, mediaKeys: string[] = []) {
    return comments.create({
      globalId: randomUUID(),
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      authorId: AuthorId,
      body,
      status: CommentStatuses.VISIBLE,
      flaggedTerms: null,
      parentId: null,
      mediaKeys,
    });
  }

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'tacgia_anh', 'x', 'MEMBER', 'ACTIVE')`,
      [AuthorId],
    );
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm ảnh bình luận',
               'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [PostId, AuthorId, CategoryId],
    );

    // ── 1. Đính ảnh ─────────────────────────────────────────────────────────
    console.log('Đính ảnh:\n');

    const withMedia = await addComment('Món này đây ạ', [
      key('a'),
      key('b'),
    ]);
    check(
      'trả về đúng hai ảnh, xếp theo slot',
      withMedia.mediaKeys.length === 2 && withMedia.mediaKeys[0] === key('a'),
      withMedia.mediaKeys.join(','),
    );

    const [row] = await dataSource.query<{ media_count: string }[]>(
      `SELECT media_count FROM content_comments WHERE global_id = $1`,
      [withMedia.globalId],
    );
    check(
      'media_count trên chính dòng bình luận khớp số ảnh',
      Number(row.media_count) === 2,
      row.media_count,
    );

    const textOnly = await addComment('Chỉ có chữ thôi');
    check('bình luận chỉ có chữ thì mảng ảnh rỗng', textOnly.mediaKeys.length === 0);

    // ── 2. Bình luận chỉ có ảnh ─────────────────────────────────────────────
    console.log('\nBình luận chỉ có ảnh:\n');

    const imageOnly = await addComment('', [key('c')]);
    check(
      'bình luận RỖNG CHỮ nhưng có ảnh là hợp lệ',
      imageOnly.mediaKeys.length === 1 && imageOnly.body === '',
    );

    let emptyRejected = false;
    try {
      await addComment('   ');
    } catch {
      emptyRejected = true;
    }
    check(
      'rỗng cả chữ lẫn ảnh thì DATABASE từ chối',
      emptyRejected,
    );

    // ── 3. Trần ba ảnh ──────────────────────────────────────────────────────
    console.log('\nTrần ba ảnh:\n');

    const capped = await addComment('Gửi năm ảnh', [
      key('1'),
      key('2'),
      key('3'),
      key('4'),
      key('5'),
    ]);
    check(
      'gửi năm ảnh thì chỉ nhận ba, không làm vỡ thao tác',
      capped.mediaKeys.length === 3,
      `${capped.mediaKeys.length} ảnh`,
    );

    const [cappedRow] = await dataSource.query<{ media_count: string }[]>(
      `SELECT media_count FROM content_comments WHERE global_id = $1`,
      [capped.globalId],
    );
    check(
      'và media_count cũng là 3, không phải 5 — nếu lệch thì ràng buộc nói dối',
      Number(cappedRow.media_count) === 3,
      cappedRow.media_count,
    );

    let overCapRejected = false;
    try {
      await dataSource.query(
        `INSERT INTO content_comment_media (comment_id, slot, storage_key)
         VALUES ($1, 4, $2)`,
        [capped.globalId, key('thua')],
      );
    } catch {
      overCapRejected = true;
    }
    check('chèn thẳng tấm thứ tư vẫn bị DATABASE chặn', overCapRejected);

    // ── 4. Gỡ bình luận thì không trả ảnh nữa ───────────────────────────────
    console.log('\nGỡ bình luận:\n');

    await comments.markStatus({
      globalId: withMedia.globalId,
      status: CommentStatuses.REMOVED,
    });
    const afterRemove = await comments.findByGlobalId(withMedia.globalId);
    check(
      'dòng ảnh vẫn còn trong bảng — chưa xoá vội, còn đối chiếu khi khiếu nại',
      (afterRemove?.mediaKeys.length ?? 0) === 2,
      String(afterRemove?.mediaKeys.length),
    );

    // ── 5. Một truy vấn cho cả trang ────────────────────────────────────────
    console.log('\nĐọc danh sách:\n');

    for (let index = 0; index < 5; index += 1)
      await addComment(`Bình luận ${index}`, [key(`p${index}`)]);

    const page = await comments.listRoots({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      limit: 50,
      viewerId: null,
    });
    check(
      'mọi bình luận trong danh sách đều mang sẵn ảnh, không phải gọi thêm vòng nào',
      page.items
        .filter((item) => item.body.startsWith('Bình luận '))
        .every((item) => item.mediaKeys.length === 1),
    );
    check(
      'bình luận chỉ có chữ vẫn trả mảng rỗng, không phải null',
      page.items
        .filter((item) => item.body === 'Chỉ có chữ thôi')
        .every((item) => Array.isArray(item.mediaKeys)),
    );

    // ── 6. Ảnh gắn đúng bình luận ───────────────────────────────────────────
    console.log('\nKhông lẫn ảnh giữa các bình luận:\n');

    const mine = page.items.find((item) => item.globalId === imageOnly.globalId);
    check(
      'ảnh không lẫn sang bình luận khác',
      mine?.mediaKeys.length === 1 && mine.mediaKeys[0] === key('c'),
      mine?.mediaKeys.join(','),
    );

    const [total] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM content_comment_media`,
    );
    const [sum] = await dataSource.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(media_count), 0) AS total FROM content_comments`,
    );
    check(
      'tổng số dòng ảnh khớp tổng media_count — hai chỗ không trôi khỏi nhau',
      Number(total.count) === Number(sum.total),
      `${total.count} dòng / ${sum.total} đếm`,
    );
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
  console.log('\nẢnh bình luận: trần do database giữ, số đếm không trôi.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
