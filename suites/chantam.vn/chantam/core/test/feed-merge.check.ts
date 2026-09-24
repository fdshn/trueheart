/**
 * Kiểm việc GỘP nút thích vào bảng cảm xúc, trên Postgres THẬT.
 *
 * Bốn thứ mà unit test mock không thấy được:
 *
 *   1. **Đổi `LIKE` sang `LOVE`**: `like_count` giảm 1 còn `reaction_count`
 *      ĐỨNG YÊN — vẫn là một người bày tỏ, chỉ đổi cách bày tỏ.
 *   2. **Hai lần bấm song song** không làm lệch số đếm.
 *   3. **Migration gộp**: ai đã thả `LOVE` thì giữ `LOVE`, không bị hạ xuống
 *      `LIKE`; và hai cột đếm sau backfill khớp với bảng cảm xúc.
 *   4. **Bảng `post_likes` đã biến mất** — còn nó thì vẫn còn hai nguồn sự thật.
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

  async function counters(): Promise<{ like: number; reaction: number }> {
    const [row] = await dataSource.query<
      { like_count: string; reaction_count: string }[]
    >(`SELECT like_count, reaction_count FROM posts WHERE global_id = $1`, [
      PostId,
    ]);
    return {
      like: Number(row.like_count),
      reaction: Number(row.reaction_count),
    };
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

    // ── 1. Bảng post_likes phải đã biến mất ─────────────────────────────────
    console.log('Một nguồn sự thật:\n');

    const [{ exists }] = await dataSource.query<{ exists: boolean }[]>(
      `SELECT to_regclass('public.post_likes') IS NOT NULL AS exists`,
    );
    check('bảng post_likes đã bị gỡ sau migration gộp', exists === false);

    // ── 2. Thích rồi đổi sang LOVE ──────────────────────────────────────────
    console.log('\nĐổi loại cảm xúc:\n');

    const first = await reactions.toggleLike(PostId, AliceId);
    check(
      'bấm thích lần đầu: liked = true, likeCount = 1',
      first.liked === true && first.likeCount === 1,
      `liked=${first.liked} count=${first.likeCount}`,
    );

    let now = await counters();
    check(
      'reaction_count cũng lên 1 — thích vẫn là một lượt bày tỏ',
      now.reaction === 1,
      String(now.reaction),
    );

    await reactions.setReaction({
      ...subject,
      userId: AliceId,
      kind: ReactionKinds.LOVE,
    });
    now = await counters();
    check(
      'đổi LIKE sang LOVE: like_count về 0',
      now.like === 0,
      String(now.like),
    );
    check(
      'nhưng reaction_count ĐỨNG YÊN ở 1 — vẫn một người',
      now.reaction === 1,
      String(now.reaction),
    );

    // ── 3. Đang LOVE mà bấm nút thích ───────────────────────────────────────
    console.log('\nBấm thích khi đang để LOVE:\n');

    const switched = await reactions.toggleLike(PostId, AliceId);
    now = await counters();
    check(
      'thành LIKE, like_count lên 1',
      switched.liked === true && now.like === 1,
      `liked=${switched.liked} like=${now.like}`,
    );
    check(
      'reaction_count vẫn 1, không nhân đôi người',
      now.reaction === 1,
      String(now.reaction),
    );

    // ── 4. Bỏ thích ─────────────────────────────────────────────────────────
    console.log('\nBỏ thích:\n');

    const off = await reactions.toggleLike(PostId, AliceId);
    now = await counters();
    check(
      'bỏ thích: cả hai cột về 0',
      off.liked === false && now.like === 0 && now.reaction === 0,
      `like=${now.like} reaction=${now.reaction}`,
    );

    // ── 5. Hai lần bấm song song ────────────────────────────────────────────
    console.log('\nBấm song song:\n');

    await Promise.all([
      reactions.toggleLike(PostId, BobId),
      reactions.toggleLike(PostId, BobId),
    ]);
    now = await counters();
    const [bobRows] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM content_reactions
       WHERE subject_id = $1 AND user_id = $2`,
      [PostId, BobId],
    );
    check(
      'hai request song song không làm số đếm âm hay vượt',
      now.like <= 1 && now.reaction <= 1 && now.like >= 0,
      `like=${now.like} reaction=${now.reaction}`,
    );
    check(
      'và không để lại hai dòng cảm xúc cho cùng một người',
      Number(bobRows.count) <= 1,
      `${bobRows.count} dòng`,
    );
    check(
      'số đếm khớp đúng số dòng thực tế',
      now.like === Number(bobRows.count) &&
        now.reaction === Number(bobRows.count),
      `đếm=${now.like}/${now.reaction} dòng=${bobRows.count}`,
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

    now = await counters();
    const [actual] = await dataSource.query<{ likes: string; total: string }[]>(
      `SELECT COUNT(*) FILTER (WHERE kind = 'LIKE') AS likes,
              COUNT(*) AS total
       FROM content_reactions WHERE subject_id = $1`,
      [PostId],
    );
    check(
      'like_count khớp số dòng kind = LIKE',
      now.like === Number(actual.likes),
      `${now.like} / ${actual.likes}`,
    );
    check(
      'reaction_count khớp tổng số dòng cảm xúc',
      now.reaction === Number(actual.total),
      `${now.reaction} / ${actual.total}`,
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
  console.log('\nGộp thích: một nguồn sự thật, hai cột đếm không trôi.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
