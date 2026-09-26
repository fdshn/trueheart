/**
 * Kiểm việc GỘP nút thích vào bảng cảm xúc, trên Postgres THẬT.
 *
 * Năm thứ mà unit test mock không thấy được:
 *
 *   1. **Bảng `post_likes` đã biến mất** — còn nó thì vẫn còn hai nguồn sự thật.
 *   2. **Cột `posts.like_count` cũng đã biến mất** (26/09). `LIKE` là một trong
 *      năm loại cảm xúc, không phải một hệ thống song song, nên chỉ còn MỘT cột
 *      đếm cho một hành vi.
 *   3. **Đổi `LIKE` sang `LOVE`** không làm `reaction_count` nhúc nhích — vẫn là
 *      một người bày tỏ, chỉ đổi cách bày tỏ.
 *   4. **Hai lần bấm song song** không làm lệch số đếm.
 *   5. **Migration gộp**: ai đã thả `LOVE` thì giữ `LOVE`, không bị hạ xuống
 *      `LIKE`; và số đếm sau backfill khớp với bảng cảm xúc.
 *
 *   npm run test:feed-merge
 */
import {
  ContentSubjectTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { ContentReactionRepository } from '../src/infrastructure/repository/content-reaction.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_feed_merge_check';
const CategoryId = '30000000-0000-4000-8000-000000000001';

const AuthorId = '99999999-9999-4999-8999-9999999e1001';
const AliceId = '99999999-9999-4999-8999-9999999e1002';
const BobId = '99999999-9999-4999-8999-9999999e1003';
const PostId = '88888888-8888-4888-8888-8888888e1001';

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

  const reactions = new ContentReactionRepository(dataSource.manager);
  const subject = {
    subjectType: ContentSubjectTypes.POST,
    subjectId: PostId,
  } as const;

  async function reactionCount(): Promise<number> {
    const [row] = await dataSource.query<{ reaction_count: string }[]>(
      `SELECT reaction_count FROM posts WHERE global_id = $1`,
      [PostId],
    );
    return Number(row.reaction_count);
  }

  async function columnExists(column: string): Promise<boolean> {
    const [row] = await dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'posts' AND column_name = $1
       ) AS exists`,
      [column],
    );
    return row.exists;
  }

  try {
    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'tacgia_gop', 'x', 'MEMBER', 'ACTIVE'),
              ($2, 'alice_gop', 'x', 'MEMBER', 'ACTIVE'),
              ($3, 'bob_gop', 'x', 'MEMBER', 'ACTIVE')`,
      [AuthorId, AliceId, BobId],
    );
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm gộp thích',
               'Mô tả đủ dài cho bài kiểm tra gộp',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0)`,
      [PostId, AuthorId, CategoryId],
    );

    // ── 1. Một nguồn sự thật, một cột đếm ───────────────────────────────────
    console.log('Một nguồn sự thật:\n');

    const [{ exists }] = await dataSource.query<{ exists: boolean }[]>(
      `SELECT to_regclass('public.post_likes') IS NOT NULL AS exists`,
    );
    check('bảng post_likes đã bị gỡ sau migration gộp', exists === false);
    check(
      'cột posts.like_count cũng đã gỡ — một hành vi thì một con số',
      (await columnExists('like_count')) === false,
    );
    check(
      'nhưng reaction_count vẫn còn, và nó là con số duy nhất',
      (await columnExists('reaction_count')) === true,
    );

    // ── 2. Bày tỏ lần đầu ───────────────────────────────────────────────────
    console.log('\nBày tỏ lần đầu:\n');

    await reactions.setReaction({
      ...subject,
      userId: AliceId,
      kind: ReactionKinds.LIKE,
    });
    check(
      'thả LIKE: reaction_count lên 1 — thích cũng là một lượt bày tỏ',
      (await reactionCount()) === 1,
      String(await reactionCount()),
    );

    // ── 3. Đổi loại KHÔNG đụng số đếm ───────────────────────────────────────
    console.log('\nĐổi loại cảm xúc:\n');

    const changed = await reactions.setReaction({
      ...subject,
      userId: AliceId,
      kind: ReactionKinds.LOVE,
    });
    check(
      'đổi LIKE sang LOVE báo created = false — không phải người mới',
      changed.created === false,
      `created=${changed.created}`,
    );
    check(
      'và reaction_count ĐỨNG YÊN ở 1 — vẫn một người',
      (await reactionCount()) === 1,
      String(await reactionCount()),
    );

    const [aliceRow] = await dataSource.query<{ kind: ReactionKinds }[]>(
      `SELECT kind FROM content_reactions
       WHERE subject_id = $1 AND user_id = $2`,
      [PostId, AliceId],
    );
    check(
      'chỉ MỘT dòng cho mỗi người, và nó mang loại mới',
      aliceRow?.kind === ReactionKinds.LOVE,
      String(aliceRow?.kind),
    );

    // ── 4. Gỡ cảm xúc ───────────────────────────────────────────────────────
    console.log('\nGỡ cảm xúc:\n');

    const removed = await reactions.removeReaction({
      ...subject,
      userId: AliceId,
    });
    check(
      'gỡ thì đếm về 0',
      removed === true && (await reactionCount()) === 0,
      `${await reactionCount()}`,
    );
    check(
      'gỡ lần nữa trả false, và không đẩy số đếm xuống âm',
      (await reactions.removeReaction({ ...subject, userId: AliceId })) ===
        false && (await reactionCount()) === 0,
      `${await reactionCount()}`,
    );

    // ── 5. Hai lần bấm song song ────────────────────────────────────────────
    console.log('\nBấm song song:\n');

    await Promise.all([
      reactions.setReaction({
        ...subject,
        userId: BobId,
        kind: ReactionKinds.LIKE,
      }),
      reactions.setReaction({
        ...subject,
        userId: BobId,
        kind: ReactionKinds.LIKE,
      }),
    ]);
    const [bobRows] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM content_reactions
       WHERE subject_id = $1 AND user_id = $2`,
      [PostId, BobId],
    );
    check(
      'không để lại hai dòng cảm xúc cho cùng một người',
      Number(bobRows.count) === 1,
      `${bobRows.count} dòng`,
    );
    check(
      'số đếm khớp đúng số dòng thực tế, không nhân đôi',
      (await reactionCount()) === Number(bobRows.count),
      `đếm=${await reactionCount()} dòng=${bobRows.count}`,
    );

    // ── 6. Số đếm không trôi khỏi bảng cảm xúc ──────────────────────────────
    console.log('\nĐối soát:\n');

    await reactions.setReaction({
      ...subject,
      userId: AliceId,
      kind: ReactionKinds.LIKE,
    });
    await reactions.setReaction({
      ...subject,
      userId: AuthorId,
      kind: ReactionKinds.WOW,
    });

    const [actual] = await dataSource.query<{ likes: string; total: string }[]>(
      `SELECT COUNT(*) FILTER (WHERE kind = 'LIKE') AS likes,
              COUNT(*) AS total
       FROM content_reactions WHERE subject_id = $1`,
      [PostId],
    );
    check(
      'reaction_count khớp TỔNG số dòng cảm xúc, không phải riêng LIKE',
      (await reactionCount()) === Number(actual.total) &&
        Number(actual.total) > Number(actual.likes),
      `đếm=${await reactionCount()} tổng=${actual.total} like=${actual.likes}`,
    );

    // ── 7. Tổng hợp trả breakdown đủ cho giao diện một nút ───────────────────
    console.log('\nTổng hợp cho giao diện:\n');

    const summary = await reactions.summarize(subject, AliceId);
    check(
      'summarize trả tổng đúng',
      summary.total === Number(actual.total),
      `${summary.total} / ${actual.total}`,
    );
    check(
      'kèm breakdown từng loại — đủ để hiện mấy biểu tượng dẫn đầu',
      summary.breakdown[ReactionKinds.LIKE] === 2 &&
        summary.breakdown[ReactionKinds.WOW] === 1,
      JSON.stringify(summary.breakdown),
    );
    check(
      'và myReaction nói người gọi đang để loại nào',
      summary.myReaction === ReactionKinds.LIKE,
      String(summary.myReaction),
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
  console.log('\nGộp thích: một nguồn sự thật, một cột đếm, không trôi.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
