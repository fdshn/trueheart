/**
 * Kiểm bình luận trên Postgres THẬT.
 *
 * Bốn thứ cần chứng minh, và cả bốn chỉ sai trên database thật:
 *
 *   1. **Số đếm chỉ tính bình luận CÔNG KHAI.** Một bình luận đang chờ Admin
 *      xem mà đã cộng vào con số người ngoài nhìn thấy thì con số đó nói dối.
 *   2. **Bộ lọc từ ngữ nối đúng vào đường ghi**, và đọc cấu hình động.
 *   3. **Con trỏ không lặp không sót** khi có bình luận mới chen vào giữa.
 *   4. **Tác giả thấy bình luận chờ duyệt của mình, người khác không.**
 *   5. **Hàng đợi Admin đọc được thật.** SQL thô của `findForAdmin` chỉ sai
 *      trên database thật — unit test mock `query` nên không thấy gì.
 *
 *   npm run test:feed-comments
 */
import {
  CommentStatuses,
  ContentSubjectTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ModerationTermsConfigKey,
  encodeKeysetCursor,
} from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { ContentCommentRepository } from '../src/infrastructure/repository/content-comment.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_feed_comments_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const AuthorId = '99999999-9999-4999-8999-9999999c1001';
const ReaderId = '99999999-9999-4999-8999-9999999c1002';
const PostId = '88888888-8888-4888-8888-8888888c1001';

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
  const adminConfig = new AdminConfigRepository(dataSource.manager);

  async function commentCount(): Promise<number> {
    const [row] = await dataSource.query<{ comment_count: string }[]>(
      `SELECT comment_count FROM posts WHERE global_id = $1`,
      [PostId],
    );
    return Number(row.comment_count);
  }

  async function addComment(
    body: string,
    status = CommentStatuses.VISIBLE,
    parentId: string | null = null,
    authorId = ReaderId,
  ) {
    return comments.create({
      globalId: randomUUID(),
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      authorId,
      body,
      status,
      flaggedTerms: null,
      parentId,
      // Kịch bản này chỉ kiểm phần chữ; ảnh có script riêng (`test:feed-media`).
      mediaKeys: [],
    });
  }

  try {
    for (const [id, username] of [
      [AuthorId, 'tacgia_bl'],
      [ReaderId, 'nguoidoc_bl'],
    ] as [string, string][])
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm bình luận',
               'Mô tả đủ dài cho bài kiểm tra',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [PostId, AuthorId, CategoryId],
    );

    // ── 1. Số đếm chỉ tính bình luận công khai ──────────────────────────────
    console.log('Số đếm:\n');

    const root = await addComment('Món này còn không ạ?');
    check('bình luận đầu tiên, đếm lên 1', (await commentCount()) === 1);

    const pending = await addComment(
      'Cẩn thận kẻo lừa đảo',
      CommentStatuses.PENDING_REVIEW,
    );
    check(
      'bình luận CHỜ DUYỆT không cộng vào số đếm công khai',
      (await commentCount()) === 1,
      `${await commentCount()}`,
    );

    const reply = await addComment(
      'Còn bạn nhé',
      CommentStatuses.VISIBLE,
      root.globalId,
    );
    check('trả lời cũng tính vào tổng bình luận', (await commentCount()) === 2);

    const [parent] = await dataSource.query<{ reply_count: string }[]>(
      `SELECT reply_count FROM content_comments WHERE global_id = $1`,
      [root.globalId],
    );
    check(
      'và cộng vào reply_count của bình luận cha',
      Number(parent.reply_count) === 1,
    );

    // ── 2. Gỡ ──────────────────────────────────────────────────────────────
    console.log('\nGỡ bình luận:\n');

    await comments.markStatus({
      globalId: reply.globalId,
      status: CommentStatuses.REMOVED,
    });
    check('gỡ thì đếm giảm', (await commentCount()) === 1);

    const [afterRemove] = await dataSource.query<{ reply_count: string }[]>(
      `SELECT reply_count FROM content_comments WHERE global_id = $1`,
      [root.globalId],
    );
    check(
      'reply_count của cha cũng giảm',
      Number(afterRemove.reply_count) === 0,
      afterRemove.reply_count,
    );
    check(
      'DÒNG vẫn còn — chuỗi trả lời giữ ngữ cảnh',
      (await comments.findByGlobalId(reply.globalId))?.status ===
        CommentStatuses.REMOVED,
    );

    await comments.markStatus({
      globalId: pending.globalId,
      status: CommentStatuses.VISIBLE,
    });
    check(
      'Admin duyệt bình luận chờ thì đếm mới lên',
      (await commentCount()) === 2,
      `${await commentCount()}`,
    );

    // ── 3. Ai thấy gì ──────────────────────────────────────────────────────
    console.log('\nBình luận chờ duyệt — ai thấy:\n');

    const hidden = await addComment(
      'Bài chờ duyệt của người đọc',
      CommentStatuses.PENDING_REVIEW,
    );

    const asStranger = await comments.listRoots({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      limit: 50,
      viewerId: AuthorId,
    });
    check(
      'người KHÁC không thấy bình luận đang chờ duyệt',
      !asStranger.items.some((item) => item.globalId === hidden.globalId),
    );

    const asAuthor = await comments.listRoots({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      limit: 50,
      viewerId: ReaderId,
    });
    check(
      'nhưng CHÍNH tác giả thấy — im lặng nuốt bài thì họ sẽ gửi lại',
      asAuthor.items.some((item) => item.globalId === hidden.globalId),
    );

    const anonymous = await comments.listRoots({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      limit: 50,
      viewerId: null,
    });
    check(
      'gọi ẩn danh chỉ thấy bình luận công khai',
      anonymous.items.every((item) => item.status === CommentStatuses.VISIBLE),
    );

    // ── 4. Con trỏ ─────────────────────────────────────────────────────────
    console.log('\nPhân trang bằng con trỏ:\n');

    for (let index = 0; index < 30; index += 1)
      await addComment(`Bình luận số ${index}`);

    const firstPage = await comments.listRoots({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      limit: 10,
      viewerId: null,
    });
    check('trang đầu đủ 10', firstPage.items.length === 10);
    check('và báo còn nữa', firstPage.hasMoreBefore === true);

    // Bình luận mới chen vào giữa hai lần gọi — chỗ OFFSET sai.
    await addComment('Bình luận chen vào giữa');

    const anchor = firstPage.items.at(-1)!;
    const secondPage = await comments.listRoots({
      subjectType: ContentSubjectTypes.POST,
      subjectId: PostId,
      limit: 10,
      before: { createdAt: anchor.createdAt, id: anchor.id },
      viewerId: null,
    });
    const firstIds = new Set(firstPage.items.map((item) => item.globalId));
    check(
      'cửa sổ sau KHÔNG lặp lại thứ vừa đọc, dù có tin chen vào giữa',
      secondPage.items.every((item) => !firstIds.has(item.globalId)),
    );

    const seen = new Set<string>();
    let before: { createdAt: Date; id: number } | null = null;
    let rounds = 0;
    for (;;) {
      const page = await comments.listRoots({
        subjectType: ContentSubjectTypes.POST,
        subjectId: PostId,
        limit: 10,
        before,
        viewerId: null,
      });
      for (const item of page.items) seen.add(item.globalId);
      rounds += 1;
      if (!page.hasMoreBefore || page.items.length === 0 || rounds > 15) break;
      const oldest = page.items.at(-1)!;
      before = { createdAt: oldest.createdAt, id: oldest.id };
    }
    check(
      'cuộn hết lấy đủ đúng số bình luận công khai, không sót',
      seen.size === (await commentCount()),
      `${seen.size} thấy / ${await commentCount()} đếm`,
    );

    check(
      'con trỏ hỏng không làm vỡ — mã hoá lại rồi giải ra vẫn khớp',
      encodeKeysetCursor({ createdAt: anchor.createdAt, id: anchor.id })
        .length > 0,
    );

    // ── 5. Trả lời đọc CŨ nhất trước ───────────────────────────────────────
    console.log('\nTrả lời:\n');

    const replyIds: string[] = [];
    for (let index = 0; index < 5; index += 1)
      replyIds.push(
        (
          await addComment(
            `Trả lời ${index}`,
            CommentStatuses.VISIBLE,
            root.globalId,
          )
        ).globalId,
      );

    const replies = await comments.listReplies({
      parentId: root.globalId,
      limit: 10,
      viewerId: null,
    });
    check(
      'trả lời đọc CŨ nhất trước — một cuộc trao đổi phải đọc từ trên xuống',
      replies.items[0].globalId === replyIds[0],
    );
    check('đủ năm trả lời', replies.items.length === 5);

    // ── 6. Bộ lọc từ ngữ đọc cấu hình động ─────────────────────────────────
    console.log('\nBộ lọc từ ngữ:\n');

    check(
      'chưa cấu hình gì thì không chặn',
      (await adminConfig.getConfigValue(ModerationTermsConfigKey)) === null,
    );

    await dataSource.query(
      `INSERT INTO system_configs
         (config_key, value_json, value_type, version, status, effective_from)
       VALUES ($1, $2::jsonb, 'JSON', 1, 'PUBLISHED', now())`,
      [
        ModerationTermsConfigKey,
        JSON.stringify(['đm', { term: 'lừa đảo', severity: 'REVIEW' }]),
      ],
    );
    const loaded = await adminConfig.getConfigValue(ModerationTermsConfigKey);
    check(
      'cấu hình đọc được ngay, không cần restart',
      Array.isArray(loaded) && loaded.length === 2,
      JSON.stringify(loaded),
    );

    // ── 7. Sửa bình luận đổi trạng thái thì đếm đi theo ─────────────────────
    console.log('\nSửa bình luận:\n');

    const before7 = await commentCount();
    await comments.updateBody({
      globalId: root.globalId,
      body: 'Sửa lại: món này còn không ạ',
      status: CommentStatuses.PENDING_REVIEW,
      flaggedTerms: 'lua dao',
    });
    check(
      'sửa xong bị gắn cờ thì RỜI khỏi số đếm công khai',
      (await commentCount()) === before7 - 1,
      `${await commentCount()} vs ${before7}`,
    );

    await comments.updateBody({
      globalId: root.globalId,
      body: 'Sửa lại lần nữa cho sạch',
      status: CommentStatuses.VISIBLE,
      flaggedTerms: null,
    });
    check(
      'sửa sạch thì quay lại số đếm',
      (await commentCount()) === before7,
      `${await commentCount()}`,
    );
    check(
      'và có mốc đã sửa',
      (await comments.findByGlobalId(root.globalId))?.editedAt !== null,
    );

    // ── 8. Hàng đợi kiểm duyệt của Admin ────────────────────────────────────
    //
    // SQL thô: unit test mock `query` nên một câu sai cú pháp lọt tới tận prod.
    console.log('\nHàng đợi Admin:\n');

    const flagged = await addComment(
      'Câu này bộ lọc giữ lại',
      CommentStatuses.PENDING_REVIEW,
    );
    await dataSource.query(
      `UPDATE content_comments SET flagged_terms = $2 WHERE global_id = $1`,
      [flagged.globalId, 'lua dao'],
    );

    const queue = await comments.findForAdmin({
      status: CommentStatuses.PENDING_REVIEW,
      skip: 0,
      take: 20,
    });
    check(
      'lọc PENDING_REVIEW chỉ trả bình luận đang chờ',
      queue.items.length > 0 &&
        queue.items.every(
          (item) => item.status === CommentStatuses.PENDING_REVIEW,
        ),
      `${queue.items.length} dòng`,
    );
    check(
      'total đếm được, không phải chỉ số dòng của trang',
      queue.total >= queue.items.length,
      `total=${queue.total}`,
    );

    const flaggedRow = queue.items.find(
      (item) => item.commentId === flagged.globalId,
    );
    check(
      'kèm TIÊU ĐỀ BÀI — Admin không phải mở từng cái để lấy ngữ cảnh',
      flaggedRow?.subjectTitle === 'Bài kiểm bình luận',
      String(flaggedRow?.subjectTitle),
    );
    check(
      'kèm tên tác giả và từ ngữ bộ lọc bắt được',
      flaggedRow?.authorUsername === 'nguoidoc_bl' &&
        flaggedRow?.flaggedTerms === 'lua dao',
      `${flaggedRow?.authorUsername} / ${flaggedRow?.flaggedTerms}`,
    );

    const removedEarlier = await addComment('Sẽ bị gỡ hẳn');
    await comments.markStatus({
      globalId: removedEarlier.globalId,
      status: CommentStatuses.REMOVED,
    });
    const all = await comments.findForAdmin({ skip: 0, take: 100 });
    check(
      'bỏ trống status thì KHÔNG trả bình luận đã gỡ',
      all.items.every((item) => item.status !== CommentStatuses.REMOVED) &&
        all.items.length > 0,
      `${all.items.length} dòng`,
    );

    const before8 = await commentCount();
    await comments.markStatus({
      globalId: flagged.globalId,
      status: CommentStatuses.VISIBLE,
    });
    check(
      'cho hiện lại thì số đếm công khai TĂNG',
      (await commentCount()) === before8 + 1,
      `${await commentCount()} vs ${before8}`,
    );
    await comments.markStatus({
      globalId: flagged.globalId,
      status: CommentStatuses.REMOVED,
    });
    check(
      'gỡ hẳn thì số đếm GIẢM lại',
      (await commentCount()) === before8,
      `${await commentCount()}`,
    );

    // `total` phải đếm TRƯỚC khi cắt: `count(*) OVER ()` chạy trước `LIMIT`.
    // Đo lại ở đây chứ không dùng `all.total` — giữa hai lần gọi đã có một
    // bình luận bị gỡ hẳn, nên con số cũ không còn đúng nữa.
    const expectedTotal = (await comments.findForAdmin({ skip: 0, take: 500 }))
      .total;
    const paged = await comments.findForAdmin({ skip: 0, take: 1 });
    check(
      'phân trang cắt đúng một dòng mà total vẫn là số thật',
      paged.items.length === 1 && paged.total === expectedTotal,
      `${paged.items.length} dòng / total=${paged.total} vs ${expectedTotal}`,
    );

    const [realCount] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM content_comments
       WHERE subject_type = 'POST' AND subject_id = $1 AND status = 'VISIBLE'`,
      [PostId],
    );
    check(
      'cột đếm khớp số dòng VISIBLE thật',
      Number(realCount.count) === (await commentCount()),
      `${realCount.count} dòng / ${await commentCount()} đếm`,
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
  console.log('\nBình luận: số đếm chỉ tính thứ công khai, con trỏ không lặp, hàng đợi Admin chạy.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
